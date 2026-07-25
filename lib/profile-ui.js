import { apiFetch } from "./api.js";
import {
  clearStructuredData,
  createId,
  readStore,
  toggleFavorite,
  updateStore,
} from "./local-store.js";
import { clearPhotos } from "./photo-store.js";
import {
  escapeHtml,
  openModal,
  setChipSelection,
  showToast,
  valuesFromChips,
} from "./ui.js";

const TASTES = ["清淡", "辣", "少油", "素食"];

export function createProfile({ openModule, openRestaurant, openPlan, reuseRequest, reusePlan, openRecord }) {
  const elements = collectElements();
  let favoriteType = "restaurant";
  elements.profileTasteChips.innerHTML = TASTES.map(
    (taste) => `<button class="chip" data-value="${taste}" type="button">${taste}</button>`
  ).join("");
  bindEvents();
  renderAll();

  function bindEvents() {
    elements.profileTasteChips.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      chip.classList.toggle("active");
      chip.setAttribute("aria-pressed", String(chip.classList.contains("active")));
    });
    elements.profileForm.addEventListener("submit", saveProfile);
    elements.addPlaceButton.addEventListener("click", (event) => editPlace(null, event.currentTarget));
    elements.commonPlaceList.addEventListener("click", handlePlaceAction);
    elements.favoriteTabs.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      favoriteType = chip.dataset.value;
      setChipSelection(elements.favoriteTabs, favoriteType, false);
      renderFavorites();
    });
    elements.favoriteList.addEventListener("click", handleFavoriteAction);
    elements.historyList.addEventListener("click", handleHistoryAction);
    elements.clearDataButton.addEventListener("click", confirmClear);
    window.addEventListener("diet-helper-store-change", renderAll);
  }

  function renderAll() {
    const { data, recovered } = readStore();
    const profile = data.userProfile;
    elements.profileBudget.value = String(profile.defaultBudget);
    elements.profilePartySize.value = String(profile.defaultPartySize);
    elements.profileRestrictions.value = profile.dietaryRestrictions.join("，");
    setChipSelection(elements.profileTasteChips, profile.tastePreferences);
    renderPlaces();
    renderFavorites();
    renderHistory();
    const profileCount = isProfileConfigured(profile) ? 1 : 0;
    elements.dataCounts.textContent =
      `资料${profileCount}份、地点${data.commonPlaces.length}个、收藏${data.favorites.length}条、方案${data.cookingPlans.length}个、记录${data.mealRecords.filter((item) => !item.deletedAt).length}条`;
    if (recovered) showToast("本地数据已恢复为空状态，原始值已保留备份。");
  }

  function saveProfile(event) {
    event.preventDefault();
    const budget = Number(elements.profileBudget.value);
    const partySize = Number(elements.profilePartySize.value);
    if (!Number.isFinite(budget) || budget < 0 || budget > 10000) {
      elements.profileMessage.textContent = "默认预算请填写0至10000。";
      elements.profileBudget.focus();
      return;
    }
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      elements.profileMessage.textContent = "默认人数请填写1至20之间的整数。";
      elements.profilePartySize.focus();
      return;
    }
    try {
      updateStore((data) => {
        data.userProfile = {
          ...data.userProfile,
          defaultBudget: budget,
          defaultPartySize: partySize,
          configured: true,
          tastePreferences: valuesFromChips(elements.profileTasteChips),
          dietaryRestrictions: elements.profileRestrictions.value
            .split(/[,，、]/).map((item) => item.trim()).filter(Boolean),
          updatedAt: new Date().toISOString(),
        };
      });
      elements.profileMessage.textContent = "已保存，只影响后续新表单。";
    } catch {
      elements.profileMessage.textContent = "本次未保存，输入已保留。";
    }
  }

  function renderPlaces() {
    const data = readStore().data;
    if (!data.commonPlaces.length) {
      elements.commonPlaceList.innerHTML = '<div class="empty-state"><span class="empty-stamp" aria-hidden="true">地</span><h2>还没有常用地点</h2><p>添加家、公司或常去的地方。</p></div>';
      return;
    }
    elements.commonPlaceList.innerHTML = data.commonPlaces.map((place) => `
      <div class="place-item">
        <div><h3>${escapeHtml(place.label)}${data.userProfile.defaultCommonPlaceId === place.id ? " · 默认" : ""}</h3><p>${escapeHtml(placeTypeLabel(place.placeType))} · ${escapeHtml(place.address)}</p></div>
        <div class="row-actions"><button type="button" data-place-action="edit" data-place-id="${escapeHtml(place.id)}">编辑</button><button type="button" data-place-action="delete" data-place-id="${escapeHtml(place.id)}">删除</button></div>
      </div>`).join("");
  }

  function editPlace(place, trigger) {
    const isDefault = readStore().data.userProfile.defaultCommonPlaceId === place?.id;
    const current = place || {
      id: "",
      label: "",
      placeType: "other",
      address: "",
      latitude: null,
      longitude: null,
    };
    openModal({
      title: place ? "编辑常用地点" : "添加常用地点",
      trigger,
      content: `<div class="form-stack">
        <label class="field-block"><span>地点名称</span><input id="placeLabel" maxlength="20" value="${escapeHtml(current.label)}" placeholder="例如：家" /></label>
        <label class="field-block"><span>地点类型</span><select id="placeType"><option value="home"${current.placeType === "home" ? " selected" : ""}>家</option><option value="work"${current.placeType === "work" ? " selected" : ""}>公司</option><option value="other"${current.placeType === "other" ? " selected" : ""}>其他</option></select></label>
        <label class="field-block"><span>地址</span><input id="placeAddress" maxlength="80" value="${escapeHtml(current.address)}" placeholder="例如：北京国贸" /></label>
        <label><input id="placeDefault" type="checkbox"${isDefault ? " checked" : ""} /> 设为默认地点</label>
        <p class="form-message" id="placeMessage"></p>
      </div>`,
      actions: [
        { label: "取消" },
        {
          label: "解析并保存",
          className: "primary-action",
          onClick: async (body) => {
            const label = body.querySelector("#placeLabel").value.trim();
            const address = body.querySelector("#placeAddress").value.trim();
            const message = body.querySelector("#placeMessage");
            if (!label) {
              message.textContent = "请填写地点名称。";
              body.querySelector("#placeLabel").focus();
              return false;
            }
            if (!address) {
              message.textContent = "请填写地址。";
              body.querySelector("#placeAddress").focus();
              return false;
            }
            try {
              const response = await apiFetch("/api/geocode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address }),
              });
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error || "地点解析失败");
              const now = new Date().toISOString();
              const longitude = Number(payload.longitude);
              const latitude = Number(payload.latitude);
              if (
                !Number.isFinite(longitude) ||
                longitude < -180 ||
                longitude > 180 ||
                !Number.isFinite(latitude) ||
                latitude < -90 ||
                latitude > 90
              ) {
                throw new Error("地点坐标无效");
              }
              const saved = {
                id: current.id || createId("place"),
                label,
                placeType: body.querySelector("#placeType").value,
                address: payload.formattedAddress || address,
                longitude,
                latitude,
                locationMode: payload.mode,
                lastUsedAt: now,
              };
              updateStore((data) => {
                const index = data.commonPlaces.findIndex((item) => item.id === saved.id);
                if (index >= 0) data.commonPlaces[index] = saved;
                else data.commonPlaces.push(saved);
                if (body.querySelector("#placeDefault").checked) {
                  data.userProfile.defaultCommonPlaceId = saved.id;
                  data.userProfile.updatedAt = now;
                }
              });
              if (payload.mode === "mock") showToast("地点已保存，当前使用明确标注的演示坐标。");
              return true;
            } catch (error) {
              message.textContent = `${error.message}，地址未保存。`;
              return false;
            }
          },
        },
      ],
    });
  }

  function handlePlaceAction(event) {
    const button = event.target.closest("[data-place-action]");
    if (!button) return;
    const data = readStore().data;
    const place = data.commonPlaces.find((item) => item.id === button.dataset.placeId);
    if (!place) return;
    if (button.dataset.placeAction === "edit") editPlace(place, button);
    if (button.dataset.placeAction === "delete") {
      const isDefault = data.userProfile.defaultCommonPlaceId === place.id;
      openModal({
        title: "删除常用地点？",
        trigger: button,
        danger: true,
        content: `<p>${isDefault ? "这是默认地点，删除后默认地点会清空。" : "删除后会从去哪吃的快捷地点中移除。"}</p>`,
        actions: [
          { label: "取消" },
          {
            label: "删除",
            className: "primary-action",
            onClick: () => updateStore((draft) => {
              draft.commonPlaces = draft.commonPlaces.filter((item) => item.id !== place.id);
              if (draft.userProfile.defaultCommonPlaceId === place.id) {
                draft.userProfile.defaultCommonPlaceId = null;
              }
            }),
          },
        ],
      });
    }
  }

  function renderFavorites() {
    const favorites = readStore().data.favorites.filter((item) => item.targetType === favoriteType);
    if (!favorites.length) {
      elements.favoriteList.innerHTML = `<div class="empty-state"><span class="empty-stamp" aria-hidden="true">藏</span><h2>${favoriteType === "restaurant" ? "没有收藏的餐厅" : "没有收藏的方案"}</h2><p>${favoriteType === "restaurant" ? "从去哪吃收藏想再去的店。" : "从自己做收藏想再做的方案。"}</p><button class="primary-compact" data-favorite-empty type="button">${favoriteType === "restaurant" ? "去看看餐厅" : "去生成方案"}</button></div>`;
      elements.favoriteList.querySelector("[data-favorite-empty]").onclick = () => openModule(favoriteType === "restaurant" ? "eat" : "cook");
      return;
    }
    elements.favoriteList.innerHTML = favorites.map((favorite) => {
      const snapshot = favorite.snapshot || {};
      const isRestaurant = favorite.targetType === "restaurant";
      const visual = isRestaurant
        ? snapshot.photo
          ? `<img src="${escapeHtml(snapshot.photo)}" alt="${escapeHtml(snapshot.name)}实景缩略图" />`
          : '<span class="favorite-placeholder" aria-hidden="true"></span>'
        : "";
      return `<div class="favorite-item${isRestaurant ? " with-photo" : ""}">
        ${visual}<div><h3>${escapeHtml(snapshot.name || snapshot.title)}</h3><p>${escapeHtml(isRestaurant ? snapshot.address : `${snapshot.estimatedMinutes}分钟 · ${(snapshot.ingredients || []).join("、")}`)}</p></div>
        <div class="row-actions"><button data-favorite-action="open" data-favorite-id="${escapeHtml(favorite.id)}" type="button">打开</button><button data-favorite-action="remove" data-favorite-id="${escapeHtml(favorite.id)}" type="button">取消收藏</button></div>
      </div>`;
    }).join("");
  }

  function handleFavoriteAction(event) {
    const button = event.target.closest("[data-favorite-action]");
    if (!button) return;
    const favorite = readStore().data.favorites.find((item) => item.id === button.dataset.favoriteId);
    if (!favorite) return;
    if (button.dataset.favoriteAction === "open") {
      openModule(favorite.targetType === "restaurant" ? "eat" : "cook");
      if (favorite.targetType === "restaurant") openRestaurant(favorite.targetId);
      else openPlan(favorite.targetId);
      return;
    }
    try {
      toggleFavorite(favorite.targetType, favorite.targetId, favorite.snapshot);
      showToast("已取消收藏。", {
        actionLabel: "重新收藏",
        onAction: () => {
          try {
            toggleFavorite(favorite.targetType, favorite.targetId, favorite.snapshot);
            renderFavorites();
          } catch {
            showToast("重新收藏失败，请检查浏览器存储空间。");
          }
        },
      });
      renderFavorites();
    } catch {
      showToast("本次取消收藏未保存。");
    }
  }

  function renderHistory() {
    const data = readStore().data;
    const requests = data.mealRequests.slice().sort(newest).slice(0, 5);
    const plans = data.cookingPlans.filter((item) => item.status !== "deleted").sort(newest).slice(0, 5);
    const records = data.mealRecords.filter((item) => !item.deletedAt).sort(newest).slice(0, 5);
    const groups = [
      ["去哪吃", "request", requests, (item) => `${item.locationLabel} · ${item.mealPeriod}`],
      ["做饭方案", "plan", plans, (item) => `${item.title} · ${item.estimatedMinutes}分钟`],
      ["饮食记录", "record", records, (item) => `${item.mealDate} · ${item.title}`],
    ];
    elements.historyList.innerHTML = groups.map(([title, type, items, label]) => `
      <div class="history-group"><h3>${title}</h3>${items.length ? items.map((item) => `<div class="history-item"><div><h3>${escapeHtml(label(item))}</h3><p>${escapeHtml(formatDate(item.createdAt))}</p></div><button class="text-action" data-history-type="${type}" data-history-id="${escapeHtml(item.id)}" type="button">${type === "request" ? "复用" : "查看"}</button></div>`).join("") : "<p class=\"data-note\">暂无历史</p>"}</div>
    `).join("");
  }

  function handleHistoryAction(event) {
    const button = event.target.closest("[data-history-type]");
    if (!button) return;
    const type = button.dataset.historyType;
    if (type === "request") {
      openModule("eat");
      reuseRequest(button.dataset.historyId);
    }
    if (type === "plan") {
      openModule("cook");
      reusePlan(button.dataset.historyId);
    }
    if (type === "record") {
      openModule("records");
      openRecord(button.dataset.historyId);
    }
  }

  function confirmClear(event) {
    openModal({
      title: "清除全部本地数据？",
      trigger: event.currentTarget,
      danger: true,
      content: "<p>这会永久删除当前浏览器里的资料、地点、收藏、方案、记录、反馈事件和照片。操作不可撤销。</p>",
      actions: [
        { label: "取消" },
        {
          label: "确认清除",
          className: "primary-action",
          onClick: async () => {
            const failures = [];
            try { clearStructuredData(); } catch { failures.push("结构化数据"); }
            try { await clearPhotos(); } catch { failures.push("照片"); }
            if (failures.length) {
              showToast(`未完成清除：${failures.join("、")}。`);
              return false;
            }
            location.reload();
            return true;
          },
        },
      ],
    });
  }

  return { refresh: renderAll };
}

function newest(a, b) {
  return String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt));
}

function isProfileConfigured(profile) {
  return Boolean(
    profile.configured ||
    profile.defaultBudget !== 80 ||
    profile.defaultPartySize !== 1 ||
    profile.defaultCommonPlaceId ||
    profile.tastePreferences.length ||
    profile.dietaryRestrictions.length
  );
}

function placeTypeLabel(value) {
  return value === "home" ? "家" : value === "work" ? "公司" : "其他";
}

function formatDate(value) {
  return String(value || "").slice(0, 10);
}

function collectElements() {
  const ids = [
    "profileForm", "profileBudget", "profilePartySize", "profileTasteChips",
    "profileRestrictions", "profileMessage", "addPlaceButton", "commonPlaceList",
    "favoriteTabs", "favoriteList", "historyList", "dataCounts", "clearDataButton",
  ];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}
