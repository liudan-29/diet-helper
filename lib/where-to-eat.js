import {
  clearFormDraft,
  createId,
  isFavorite,
  readFormDraft,
  readStore,
  saveFormDraft,
  toggleFavorite,
  updateStore,
} from "./local-store.js";
import {
  currentMealPeriod,
  escapeHtml,
  openModal,
  setChipSelection,
  showToast,
  todayString,
  valuesFromChips,
} from "./ui.js";

const DEMO_LOCATION = {
  latitude: 39.908823,
  longitude: 116.39747,
  label: "北京·演示坐标",
  isDemo: true,
};

export function createWhereToEat({ openRecordEditor, openModule }) {
  const elements = collectElements();
  const profile = readStore().data.userProfile;
  const initialDraft = readFormDraft("whereToEat");
  const draft = initialDraft || {};
  let hasCurrentDraft = Boolean(initialDraft);
  const state = {
    meal: draft.meal || currentMealPeriod(),
    occasion: draft.occasion || "日常",
    customOccasion: draft.customOccasion || "",
    partySize: draft.partySize ?? profile.defaultPartySize,
    tastePreferences: draft.tastePreferences || [...profile.tastePreferences],
    customRequirement: draft.customRequirement || "",
    budget: draft.budget ?? profile.defaultBudget,
    radius: draft.radius || 1000,
    location: draft.location || null,
    restaurants: [],
    index: 0,
    loading: false,
    requestSequence: 0,
    geocodeSequence: 0,
    dataMode: "mock",
    search: null,
    photoIndexByRestaurant: {},
    failedPhotos: new Set(),
    photoPromises: new Map(),
    currentRequestId: null,
    roundComplete: false,
  };

  restoreForm();
  bindEvents();
  renderQuickPlaces();

  function restoreForm() {
    setChipSelection(elements.mealChips, state.meal, false);
    setChipSelection(elements.occasionChips, state.occasion, false);
    setChipSelection(elements.eatTasteChips, state.tastePreferences);
    elements.partySizeInput.value = String(state.partySize);
    elements.budgetInput.value = String(state.budget);
    elements.customOccasionInput.value = state.customOccasion;
    elements.customRequirementInput.value = state.customRequirement;
    elements.customOccasionField.hidden = state.occasion !== "其他";
    if (state.location) elements.locationText.textContent = state.location.label;
  }

  function bindEvents() {
    elements.mealChips.addEventListener("click", selectSingleChip("meal"));
    elements.occasionChips.addEventListener("click", (event) => {
      selectSingleChip("occasion")(event);
      elements.customOccasionField.hidden = state.occasion !== "其他";
      if (state.occasion === "其他") elements.customOccasionInput.focus();
    });
    elements.eatTasteChips.addEventListener("click", selectMultipleChips("tastePreferences"));
    [
      elements.partySizeInput,
      elements.budgetInput,
      elements.customOccasionInput,
      elements.customRequirementInput,
    ].forEach((input) => input.addEventListener("input", saveDraft));
    elements.locationButton.addEventListener("click", locateUser);
    elements.manualLocationButton.addEventListener("click", resolveManualLocation);
    elements.recommendButton.addEventListener("click", requestRecommendations);
    elements.previousButton.addEventListener("click", () => changeRestaurant(-1, false));
    elements.nextButton.addEventListener("click", () => changeRestaurant(1, true));
    elements.navigateButton.addEventListener("click", navigateCurrent);
    elements.restaurantFavoriteButton.addEventListener("click", toggleCurrentFavorite);
    elements.restaurantDetailButton.addEventListener("click", showRestaurantDetails);
    elements.feedbackButton.addEventListener("click", showFeedback);
    elements.restaurantRecordButton.addEventListener("click", recordCurrentRestaurant);
    elements.photoPreviousButton.addEventListener("click", () => changePhoto(-1));
    elements.photoNextButton.addEventListener("click", () => changePhoto(1));
    elements.photoPagination.addEventListener("click", (event) => {
      const button = event.target.closest("[data-photo-index]");
      const item = currentRestaurant();
      if (!button || !item) return;
      state.photoIndexByRestaurant[item.id] = Number(button.dataset.photoIndex);
      renderPhoto(item);
    });
    bindPhotoSwipe();
  }

  function selectSingleChip(key) {
    return (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      state[key] = chip.dataset.value;
      setChipSelection(event.currentTarget, state[key], false);
      saveDraft();
    };
  }

  function selectMultipleChips(key) {
    return (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      chip.classList.toggle("active");
      chip.setAttribute("aria-pressed", String(chip.classList.contains("active")));
      state[key] = valuesFromChips(event.currentTarget);
      saveDraft();
    };
  }

  function saveDraft() {
    hasCurrentDraft = true;
    state.partySize = Number(elements.partySizeInput.value);
    state.budget = Number(elements.budgetInput.value);
    state.customOccasion = elements.customOccasionInput.value;
    state.customRequirement = elements.customRequirementInput.value;
    saveFormDraft("whereToEat", {
      meal: state.meal,
      occasion: state.occasion,
      customOccasion: state.customOccasion,
      partySize: state.partySize,
      tastePreferences: state.tastePreferences,
      customRequirement: state.customRequirement,
      budget: state.budget,
      radius: state.radius,
      location: state.location,
    });
  }

  function locateUser() {
    elements.formMessage.textContent = "";
    if (!navigator.geolocation) return showManualLocation("当前浏览器不支持定位，请输入地点。");
    elements.locationButton.disabled = true;
    elements.locationText.textContent = "正在定位…";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "当前位置",
          isDemo: false,
        };
        elements.locationText.textContent = "已定位 · 周边1km";
        elements.locationPanel.hidden = true;
        elements.locationButton.disabled = false;
        saveDraft();
      },
      () => {
        elements.locationButton.disabled = false;
        elements.locationText.textContent = "定位未完成";
        showManualLocation("没有获得定位权限，可以输入地点继续。");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  function showManualLocation(message) {
    elements.locationPanel.hidden = false;
    elements.formMessage.textContent = message;
    elements.manualLocationInput.focus();
  }

  async function resolveManualLocation() {
    const address = elements.manualLocationInput.value.trim();
    if (!address) {
      elements.formMessage.textContent = "请输入一个地点名称。";
      elements.manualLocationInput.focus();
      return;
    }
    const sequence = ++state.geocodeSequence;
    elements.manualLocationButton.disabled = true;
    elements.manualLocationButton.textContent = "正在解析地点…";
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "地点解析失败");
      if (sequence !== state.geocodeSequence) return;
      state.location = {
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        label: payload.formattedAddress || address,
        isDemo: payload.mode === "mock",
      };
      elements.locationText.textContent = state.location.label;
      elements.locationPanel.hidden = true;
      elements.formMessage.textContent =
        payload.mode === "mock" ? "当前未配置高德Key，地点使用明确标注的演示坐标。" : "";
      saveDraft();
    } catch (error) {
      if (sequence === state.geocodeSequence) {
        elements.formMessage.textContent = `${error.message}，请修改地点或重试。`;
      }
    } finally {
      if (sequence === state.geocodeSequence) {
        elements.manualLocationButton.disabled = false;
        elements.manualLocationButton.textContent = "解析并使用这个地点";
      }
    }
  }

  async function requestRecommendations() {
    if (state.loading || !validateRequest()) return;
    const sequence = ++state.requestSequence;
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const request = buildRequest();
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "查询失败");
      if (sequence !== state.requestSequence) return;
      state.restaurants = payload.restaurants || [];
      state.index = 0;
      state.roundComplete = false;
      state.dataMode = payload.mode;
      state.search = payload.search || null;
      state.currentRequestId = persistMealRequest(request, state.restaurants);
      clearFormDraft("whereToEat");
      hasCurrentDraft = false;
      renderRestaurant();
      elements.resultSection.hidden = false;
      elements.formMessage.textContent = "";
      elements.resultSection.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    } catch (error) {
      if (sequence !== state.requestSequence) return;
      elements.formMessage.textContent =
        error.name === "AbortError" ? "查询超过25秒，请重试。" : `${error.message}，请重试。`;
    } finally {
      clearTimeout(timeout);
      if (sequence === state.requestSequence) setLoading(false);
    }
  }

  function validateRequest() {
    if (!state.location) {
      showManualLocation("请先定位或输入地点。");
      return false;
    }
    const values = [
      [elements.budgetInput, Number(elements.budgetInput.value), 0, 10000, "人均预算请填写0至10000之间的金额。"],
      [elements.partySizeInput, Number(elements.partySizeInput.value), 1, 50, "同行人数请填写1至50之间的整数。"],
    ];
    for (const [input, value, min, max, message] of values) {
      input.classList.remove("invalid");
      if (!Number.isFinite(value) || value < min || value > max || (input === elements.partySizeInput && !Number.isInteger(value))) {
        input.classList.add("invalid");
        elements.formMessage.textContent = message;
        input.focus();
        return false;
      }
    }
    if (state.occasion === "其他" && !elements.customOccasionInput.value.trim()) {
      elements.formMessage.textContent = "请填写这次的用餐场合。";
      elements.customOccasionInput.focus();
      return false;
    }
    saveDraft();
    return true;
  }

  function buildRequest() {
    state.partySize = Number(elements.partySizeInput.value);
    state.budget = Number(elements.budgetInput.value);
    state.customOccasion = elements.customOccasionInput.value.trim();
    state.customRequirement = elements.customRequirementInput.value.trim();
    return {
      latitude: state.location.latitude,
      longitude: state.location.longitude,
      locationLabel: state.location.label,
      mealPeriod: state.meal,
      occasion: state.occasion,
      customOccasion: state.customOccasion,
      partySize: state.partySize,
      tastePreferences: state.tastePreferences,
      customRequirement: state.customRequirement,
      budget: state.budget,
      radius: state.radius,
    };
  }

  function persistMealRequest(request, restaurants) {
    const requestId = createId("meal-request");
    try {
      updateStore((data) => {
        const now = new Date().toISOString();
        data.mealRequests.push({
          id: requestId,
          ...request,
          status: restaurants.length ? "results" : "empty",
          restaurantIds: restaurants.map((item) => item.id),
          selectedRestaurantId: null,
          createdAt: now,
          updatedAt: now,
        });
        data.mealRequests = data.mealRequests
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50);
        restaurants.forEach((item) => {
          data.restaurants[item.id] = { ...item, capturedAt: now };
        });
      });
      return requestId;
    } catch {
      showToast("查询成功，但本地历史未保存。");
      return null;
    }
  }

  function setLoading(loading) {
    state.loading = loading;
    elements.recommendButton.disabled = loading;
    elements.recommendButton.innerHTML = loading
      ? "正在查询附近餐厅并筛选 <span>···</span>"
      : "给我挑一家 <span>↗</span>";
  }

  function renderRestaurant() {
    const item = currentRestaurant();
    elements.resultSection.hidden = false;
    if (!item) {
      elements.restaurantCard.hidden = true;
      elements.resultTitle.textContent = "附近暂时没有合适结果";
      elements.resultCount.textContent = "00 / 00";
      elements.dataNote.textContent = "可以修改条件或稍后扩大范围再试。";
      return;
    }
    elements.restaurantCard.hidden = false;
    elements.resultTitle.textContent = `${state.location.label}附近的${state.meal}`;
    elements.resultCount.textContent = `${pad(state.index + 1)} / ${pad(state.restaurants.length)}`;
    elements.cardVisual.classList.remove("theme-2", "theme-3", "theme-4");
    elements.cardVisual.classList.add(`theme-${visualTheme(item, state.index)}`);
    renderPhoto(item);
    elements.restaurantName.textContent = item.name;
    elements.restaurantMeta.textContent = restaurantMeta(item);
    elements.restaurantRating.hidden = item.rating === null;
    elements.restaurantRating.textContent = item.rating?.toFixed?.(1) || item.rating || "";
    elements.dishStamp.textContent = stampFor(item);
    elements.cardKicker.textContent = item.reasons?.[0] || "附近可选";
    elements.restaurantReason.textContent = buildReason(item);
    elements.tagList.innerHTML = [...new Set([
      ...(item.businessStatus === "open" ? ["正在营业"] : []),
      ...(item.reasons || []),
    ])].slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    elements.previousButton.disabled = state.index === 0;
    elements.nextButton.textContent = state.roundComplete
      ? "已看完一轮"
      : state.index === state.restaurants.length - 1
        ? "看完这一轮"
        : "换一家";
    elements.nextButton.disabled = state.roundComplete;
    elements.navigateButton.disabled = !item.navigationUrl;
    const favorite = isFavorite("restaurant", item.id);
    elements.restaurantFavoriteButton.classList.toggle("active", favorite);
    elements.restaurantFavoriteButton.textContent = favorite ? "★" : "☆";
    elements.restaurantFavoriteButton.setAttribute("aria-label", favorite ? "取消收藏餐厅" : "收藏餐厅");
    elements.dataNote.textContent =
      state.dataMode === "amap-mcp"
        ? state.search?.expanded
          ? `餐厅数据来自高德；候选不足时已扩大到${formatDistance(state.search.usedRadius)}，共找到${state.restaurants.length}家。`
          : `餐厅数据来自高德；本次共找到${state.restaurants.length}家合适餐厅。`
        : "当前使用明确标注的演示数据；配置服务端高德Key后自动切换为真实餐厅。";
    recordEvent("view", item.id, false);
  }

  function changeRestaurant(step, recordSkip) {
    const current = currentRestaurant();
    if (!state.restaurants.length) return;
    if (recordSkip && current) recordEvent("skip", current.id, false);
    if (step > 0 && state.index === state.restaurants.length - 1) {
      finishRound();
      return;
    }
    state.index = Math.max(0, Math.min(state.restaurants.length - 1, state.index + step));
    state.roundComplete = false;
    renderRestaurant();
  }

  function finishRound() {
    state.roundComplete = true;
    renderRestaurant();
    showToast("这一轮已经看完，可以返回上一家或修改条件。");
  }

  function renderPhoto(item) {
    const urls = photoUrls(item);
    const index = Math.min(state.photoIndexByRestaurant[item.id] || 0, Math.max(0, urls.length - 1));
    const url = urls[index] || "";
    state.photoIndexByRestaurant[item.id] = index;
    elements.restaurantPhoto.dataset.pendingPhotoUrl = url;
    renderPhotoControls(item, urls, index);
    if (!url) {
      elements.cardVisual.classList.remove("has-photo", "photo-loading");
      elements.restaurantPhoto.removeAttribute("src");
      elements.restaurantPhoto.alt = "";
      return;
    }
    elements.cardVisual.classList.add("photo-loading");
    urls.forEach((photoUrl) => loadPhoto(photoUrl).catch(() => {}));
    loadPhoto(url).then(() => {
      if (elements.restaurantPhoto.dataset.pendingPhotoUrl !== url) return;
      elements.restaurantPhoto.onload = () => {
        elements.cardVisual.classList.add("has-photo");
        elements.cardVisual.classList.remove("photo-loading");
      };
      elements.restaurantPhoto.alt = `${item.name}实景照片，第${index + 1}张，共${urls.length}张`;
      elements.restaurantPhoto.src = url;
      if (elements.restaurantPhoto.complete) elements.restaurantPhoto.onload();
    }).catch(() => renderPhoto(item));
  }

  function renderPhotoControls(item, urls, index) {
    const multiple = urls.length > 1;
    elements.photoPreviousButton.hidden = !multiple;
    elements.photoNextButton.hidden = !multiple;
    elements.photoPagination.hidden = !multiple;
    elements.photoPagination.innerHTML = multiple
      ? urls.map((_, photoIndex) => `<button class="photo-dot${photoIndex === index ? " active" : ""}" data-photo-index="${photoIndex}" type="button" aria-label="查看第${photoIndex + 1}张照片"></button>`).join("")
      : "";
    elements.photoSource.hidden = urls.length === 0;
    elements.photoSource.textContent = urls.length ? `高德实景 · ${index + 1}/${urls.length}` : "";
  }

  function changePhoto(step) {
    const item = currentRestaurant();
    if (!item) return;
    const urls = photoUrls(item);
    if (urls.length < 2) return;
    state.photoIndexByRestaurant[item.id] =
      ((state.photoIndexByRestaurant[item.id] || 0) + step + urls.length) % urls.length;
    renderPhoto(item);
  }

  function bindPhotoSwipe() {
    let start = null;
    elements.cardVisual.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      start = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    elements.cardVisual.addEventListener("touchend", (event) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const x = touch.clientX - start.x;
      const y = touch.clientY - start.y;
      start = null;
      if (Math.abs(x) >= 40 && Math.abs(x) > Math.abs(y)) changePhoto(x < 0 ? 1 : -1);
    }, { passive: true });
  }

  function loadPhoto(url) {
    if (state.photoPromises.has(url)) return state.photoPromises.get(url);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = resolve;
      image.onerror = () => reject(new Error("照片加载失败"));
      image.src = url;
    }).catch((error) => {
      state.failedPhotos.add(url);
      state.photoPromises.delete(url);
      throw error;
    });
    state.photoPromises.set(url, promise);
    return promise;
  }

  function photoUrls(item) {
    return [...new Set((item.photos || []).map(safePhotoUrl).filter(Boolean))]
      .filter((url) => !state.failedPhotos.has(url));
  }

  function toggleCurrentFavorite() {
    const item = currentRestaurant();
    if (!item) return;
    const wasFavorite = isFavorite("restaurant", item.id);
    try {
      const result = toggleFavorite("restaurant", item.id, {
        name: item.name,
        address: item.address,
        photo: photoUrls(item)[0] || "",
        category: item.category,
        longitude: item.longitude,
        latitude: item.latitude,
        navigationUrl: item.navigationUrl,
      });
      renderRestaurant();
      showToast(result.active ? "已收藏餐厅。" : "已取消收藏。", {
        actionLabel: result.active ? "" : "重新收藏",
        onAction: result.active ? null : toggleCurrentFavorite,
      });
    } catch {
      elements.restaurantFavoriteButton.classList.toggle("active", wasFavorite);
      showToast("本次收藏未保存，请检查浏览器存储空间。");
    }
  }

  function showRestaurantDetails(event) {
    const item = currentRestaurant();
    if (!item) return;
    recordEvent("detail", item.id, false);
    const photos = photoUrls(item);
    const rows = [
      ["地址", item.address],
      ["电话", item.phone],
      ["营业时间", item.businessHours],
    ].filter(([, value]) => String(value || "").trim());
    const content = `
      ${photos.length ? `<div class="detail-photos">${photos.map((photo, index) => `<img class="restaurant-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(item.name)}实景照片，第${index + 1}张，共${photos.length}张" />`).join("")}</div>` : ""}
      <p>${escapeHtml(restaurantMeta(item))}</p>
      <dl>${rows.map(([label, value]) => `<div class="detail-row"><dt>${label}</dt><dd>${label === "电话" ? `<a href="tel:${escapeHtml(value)}">${escapeHtml(value)}</a>` : escapeHtml(value)}</dd></div>`).join("")}</dl>
      <p class="data-note">${state.dataMode === "amap-mcp" ? "餐厅信息与实景照片来自高德，字段以本次查询快照为准。" : "当前为明确标注的演示数据。"}</p>`;
    const modal = openModal({
      title: item.name,
      content,
      trigger: event.currentTarget,
      actions: [
        { label: "记一笔", onClick: () => recordCurrentRestaurant() },
        { label: "去这里", className: "primary-action", onClick: navigateCurrent },
      ],
    });
    modal.body.querySelectorAll(".detail-photos img").forEach((image) => {
      image.addEventListener("error", () => {
        state.failedPhotos.add(image.src);
        image.remove();
        if (!modal.body.querySelector(".detail-photos img")) {
          modal.body.querySelector(".detail-photos")?.remove();
        }
      });
    });
  }

  function showFeedback(event) {
    const item = currentRestaurant();
    if (!item) return;
    const reasons = ["餐次不符", "场合不符", "超预算", "距离太远", "已打烊", "不喜欢品类", "其他"];
    const modal = openModal({
      title: "哪里不合适？",
      trigger: event.currentTarget,
      content: `<div class="form-stack" id="feedbackReasons">${reasons.map((reason, index) => `<label><input type="radio" name="feedbackReason" value="${reason}"${index === 0 ? " checked" : ""} /> ${reason}</label>`).join("")}<label id="otherFeedbackField" hidden>补充说明<textarea maxlength="80"></textarea></label></div>`,
      actions: [
        { label: "取消" },
        {
          label: "提交并看下一家",
          className: "primary-action",
          onClick: (body) => {
            const reason = body.querySelector('[name="feedbackReason"]:checked')?.value;
            const detail = body.querySelector("textarea")?.value.trim() || "";
            recordEvent("not-suitable", item.id, true, { reason, detail });
            if (state.index === state.restaurants.length - 1) finishRound();
            else changeRestaurant(1, false);
          },
        },
      ],
    });
    modal.body.querySelector("#feedbackReasons").addEventListener("change", (changeEvent) => {
      const other = changeEvent.target.value === "其他";
      modal.body.querySelector("#otherFeedbackField").hidden = !other;
    });
  }

  function navigateCurrent() {
    const item = currentRestaurant();
    if (!item?.navigationUrl) return false;
    recordEvent("navigate", item.id, false);
    window.open(item.navigationUrl, "_blank", "noopener,noreferrer");
    return true;
  }

  function recordCurrentRestaurant() {
    const item = currentRestaurant();
    if (!item) return false;
    recordEvent("select", item.id, false);
    openRecordEditor({
      sourceType: "restaurant",
      sourceId: item.id,
      title: item.name,
      foods: "",
      mealDate: todayString(),
      mealPeriod: state.meal,
      partySize: state.partySize,
      sourceHint: `来自去哪吃 · ${item.name}`,
    });
    return true;
  }

  function recordEvent(type, restaurantId, notifyFailure, details = {}) {
    try {
      updateStore((data) => {
        const feedbackEvent = {
          id: createId("event"),
          type,
          restaurantId,
          requestId: state.currentRequestId,
          mealPeriod: state.meal,
          ...details,
          createdAt: new Date().toISOString(),
        };
        if (type === "not-suitable" || type === "skip") {
          feedbackEvent.restaurantStatus = "skipped";
        }
        data.feedbackEvents.push(feedbackEvent);
        if (feedbackEvent.restaurantStatus === "skipped" && state.currentRequestId) {
          const request = data.mealRequests.find((item) => item.id === state.currentRequestId);
          if (request) {
            request.skippedRestaurantIds = [
              ...new Set([...(request.skippedRestaurantIds || []), restaurantId]),
            ];
            request.updatedAt = feedbackEvent.createdAt;
          }
        }
        data.feedbackEvents = data.feedbackEvents.slice(-300);
      });
      return true;
    } catch {
      if (notifyFailure) showToast("已切换下一家，但反馈未保存。");
      return false;
    }
  }

  function renderQuickPlaces() {
    const places = readStore().data.commonPlaces.slice(0, 3);
    elements.quickPlaces.innerHTML = places.map((place) =>
      `<button class="chip" type="button" data-place-id="${escapeHtml(place.id)}">${escapeHtml(place.label)}</button>`
    ).join("");
    if (places.length) {
      elements.quickPlaces.insertAdjacentHTML("beforeend", '<button class="chip" type="button" data-manage-places>管理地点</button>');
    }
    elements.quickPlaces.onclick = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.managePlaces !== undefined) return openModule("mine");
      const place = readStore().data.commonPlaces.find((entry) => entry.id === button.dataset.placeId);
      if (!place) return;
      state.location = {
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.address || place.label,
        isDemo: false,
      };
      elements.locationText.textContent = place.label;
      saveDraft();
    };
  }

  function currentRestaurant() {
    return state.restaurants[state.index];
  }

  return {
    refresh() {
      applyLatestProfileDefaults();
      renderQuickPlaces();
    },
    startNewRequest() {
      clearFormDraft("whereToEat");
      hasCurrentDraft = false;
      state.restaurants = [];
      state.index = 0;
      state.currentRequestId = null;
      state.roundComplete = false;
      elements.resultSection.hidden = true;
      applyLatestProfileDefaults();
    },
    openRestaurant(id) {
      const restaurant = readStore().data.restaurants[id];
      if (!restaurant) return;
      state.restaurants = [restaurant];
      state.index = 0;
      state.location = { label: restaurant.requestLocation || "历史地点" };
      elements.resultSection.hidden = false;
      renderRestaurant();
    },
    reuseRequest(id) {
      const request = readStore().data.mealRequests.find((item) => item.id === id);
      if (!request) return;
      Object.assign(state, {
        meal: request.mealPeriod,
        occasion: request.occasionPreset || request.occasion,
        partySize: request.partySize,
        tastePreferences: request.tastePreferences,
        customRequirement: request.customRequirement,
        budget: request.budget,
        radius: request.radius,
        location: {
          label: request.locationLabel,
          latitude: request.latitude,
          longitude: request.longitude,
        },
      });
      restoreForm();
      saveDraft();
    },
  };

  function applyLatestProfileDefaults() {
    if (hasCurrentDraft) return;
    const latestProfile = readStore().data.userProfile;
    state.partySize = latestProfile.defaultPartySize;
    state.tastePreferences = [...latestProfile.tastePreferences];
    state.budget = latestProfile.defaultBudget;
    restoreForm();
  }
}

function collectElements() {
  const ids = [
    "locationButton", "locationText", "locationPanel", "manualLocationInput",
    "manualLocationButton", "mealChips", "occasionChips", "eatTasteChips",
    "customOccasionField", "customOccasionInput", "partySizeInput",
    "customRequirementInput", "budgetInput", "recommendButton", "formMessage",
    "resultSection", "resultTitle", "resultCount", "restaurantCard", "cardVisual",
    "restaurantPhoto", "photoSource", "photoPreviousButton", "photoNextButton",
    "photoPagination", "restaurantName", "restaurantMeta", "restaurantRating",
    "dishStamp", "cardKicker", "restaurantReason", "tagList", "previousButton",
    "nextButton", "navigateButton", "restaurantFavoriteButton",
    "restaurantDetailButton", "feedbackButton", "restaurantRecordButton",
    "dataNote", "quickPlaces",
  ];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return "";
  }
}

function shortCategory(category) {
  return String(category || "餐饮").split(";").filter(Boolean).at(-1);
}

function restaurantMeta(item) {
  const values = [shortCategory(item.category)];
  if (item.distance > 0) values.push(item.distance >= 1000 ? `${(item.distance / 1000).toFixed(1)}km` : `${Math.round(item.distance)}m`);
  if (item.averageCost !== null && item.averageCost !== undefined) values.push(`人均 ¥${Math.round(item.averageCost)}`);
  return values.join(" · ");
}

function stampFor(item) {
  return shortCategory(item.category).replace(/餐厅|餐饮|服务|小吃/g, "").slice(0, 1) || "食";
}

function buildReason(item) {
  return item.reasons?.length
    ? `${item.reasons.join("，")}，符合这次用餐条件。`
    : "这家店位于本次搜索范围内，可以作为候选。";
}

function visualTheme(item, index) {
  if (/轻食|素食|江浙|粤菜/.test(item.category)) return 2;
  return (index % 4) + 1;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDistance(distance) {
  return distance >= 1000
    ? `${(distance / 1000).toFixed(1)}km`
    : `${Math.round(distance)}m`;
}
