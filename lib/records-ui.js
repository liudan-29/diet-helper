import {
  createId,
  readStore,
  removeItem,
  upsertItem,
  updateStore,
} from "./local-store.js";
import {
  deletePhoto,
  getPhoto,
  photoObjectUrl,
  preparePhoto,
  savePhoto,
} from "./photo-store.js";
import {
  currentMealPeriod,
  escapeHtml,
  openModal,
  setChipSelection,
  showToast,
  todayString,
} from "./ui.js";

const PERIOD_ORDER = { 早餐: 6, 午餐: 11, 晚餐: 17, 夜宵: 21 };
const SOURCE_LABELS = {
  restaurant: "外出就餐",
  cooking: "自己做",
  takeout: "外卖",
  other: "其他",
};
const FEELING_LABELS = { great: "很满意", okay: "还可以", bad: "不太好" };

export function createRecords() {
  const elements = collectElements();
  const state = {
    filter: "all",
    dateFilter: "",
    editingPhotoBlob: null,
    existingPhotoId: null,
    photoFailed: false,
    dirty: false,
    detailId: null,
    objectUrls: new Set(),
    photoTaskId: 0,
    previewLoadId: 0,
    detailLoadId: 0,
    listRenderId: 0,
    photoBusy: false,
  };

  bindEvents();
  recoverDeletedRecords();
  renderList();

  function bindEvents() {
    elements.newRecordButton.addEventListener("click", () => openEditor());
    elements.recordEditorBack.addEventListener("click", leaveEditor);
    elements.recordDetailBack.addEventListener("click", showList);
    elements.recordFilterChips.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      state.filter = chip.dataset.value;
      setChipSelection(elements.recordFilterChips, state.filter, false);
      renderList();
    });
    elements.recordDateFilter.addEventListener("input", () => {
      state.dateFilter = elements.recordDateFilter.value;
      renderList();
    });
    elements.clearRecordFilters.addEventListener("click", clearFilters);
    elements.recordList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-record-id]");
      if (item) showDetail(item.dataset.recordId);
    });
    elements.recordForm.addEventListener("input", () => {
      state.dirty = true;
    });
    elements.recordForm.addEventListener("submit", saveRecord);
    elements.recordFeelingChips.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      setChipSelection(elements.recordFeelingChips, chip.dataset.value, false);
      state.dirty = true;
    });
    elements.recordPhoto.addEventListener("change", selectPhoto);
    elements.removeRecordPhoto.addEventListener("click", removeSelectedPhoto);
    window.addEventListener("diet-helper-store-change", () => {
      if (!elements.recordListView.hidden) renderList();
    });
  }

  function openEditor(prefill = {}) {
    const profile = readStore().data.userProfile;
    state.dirty = false;
    state.editingPhotoBlob = null;
    state.existingPhotoId = prefill.photoId || null;
    state.photoFailed = false;
    state.photoBusy = false;
    state.photoTaskId += 1;
    state.previewLoadId += 1;
    elements.saveRecordButton.disabled = false;
    elements.recordForm.reset();
    elements.recordId.value = prefill.id || "";
    elements.recordSourceId.value = prefill.sourceId || "";
    elements.recordDate.value = prefill.mealDate || todayString();
    elements.recordMealPeriod.value = prefill.mealPeriod || currentMealPeriod();
    elements.recordSourceType.value = prefill.sourceType || "restaurant";
    elements.recordTitle.value = prefill.title || "";
    elements.recordFoods.value = prefill.foods || "";
    elements.recordCost.value = prefill.cost ?? "";
    elements.recordPartySize.value = String(prefill.partySize || profile.defaultPartySize);
    elements.recordNote.value = prefill.note || "";
    setChipSelection(elements.recordFeelingChips, prefill.feeling || "great", false);
    elements.recordSourceHint.textContent = prefill.sourceHint || "";
    elements.recordEditorHeading.textContent = prefill.id ? "编辑记录" : "新建记录";
    elements.recordFormMessage.textContent = "";
    elements.recordPhotoMessage.textContent = "";
    elements.recordPhotoPreview.hidden = true;
    if (prefill.photoId) renderExistingPhoto(prefill.photoId);
    showView(elements.recordEditorView);
    elements.recordEditorHeading.focus();
  }

  function leaveEditor() {
    if (state.dirty && !window.confirm("有尚未保存的修改，确定放弃吗？")) return false;
    showList();
    return true;
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const taskId = ++state.photoTaskId;
    state.photoBusy = true;
    elements.saveRecordButton.disabled = true;
    elements.recordPhotoMessage.textContent = "正在压缩照片…";
    try {
      const blob = await preparePhoto(file);
      if (taskId !== state.photoTaskId) return;
      state.editingPhotoBlob = blob;
      state.photoFailed = false;
      const url = URL.createObjectURL(blob);
      trackUrl(url);
      elements.recordPhotoPreview.querySelector("img").src = url;
      elements.recordPhotoPreview.hidden = false;
      elements.recordPhotoMessage.textContent = `已压缩，${formatBytes(blob.size)}。`;
      state.dirty = true;
    } catch (error) {
      if (taskId !== state.photoTaskId) return;
      state.editingPhotoBlob = null;
      state.photoFailed = true;
      elements.recordPhotoMessage.textContent = `${error.message}。可以重新选择或移除照片后保存文字记录。`;
    } finally {
      if (taskId === state.photoTaskId) {
        state.photoBusy = false;
        elements.saveRecordButton.disabled = false;
      }
    }
  }

  function removeSelectedPhoto(event) {
    event.preventDefault();
    state.photoTaskId += 1;
    state.previewLoadId += 1;
    state.photoBusy = false;
    state.editingPhotoBlob = null;
    state.existingPhotoId = null;
    state.photoFailed = false;
    elements.recordPhoto.value = "";
    elements.recordPhotoPreview.hidden = true;
    elements.recordPhotoPreview.querySelector("img").removeAttribute("src");
    elements.saveRecordButton.disabled = false;
    elements.recordPhotoMessage.textContent = "已移除照片，将只保存文字记录。";
    state.dirty = true;
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (state.photoBusy) {
      elements.recordFormMessage.textContent = "照片仍在处理中，请稍候再保存。";
      return;
    }
    if (state.photoFailed) {
      elements.recordFormMessage.textContent = "照片处理失败，请重新选择或移除照片后再保存。";
      elements.recordPhoto.focus();
      return;
    }
    const input = readRecordForm();
    if (!validateRecord(input)) return;
    elements.saveRecordButton.disabled = true;
    elements.saveRecordButton.innerHTML = "正在保存 <span>···</span>";
    let photoId = state.existingPhotoId;
    try {
      if (state.editingPhotoBlob) {
        photoId = createId("photo");
        await savePhoto(photoId, state.editingPhotoBlob);
      }
      const now = new Date().toISOString();
      const existing = input.id
        ? readStore().data.mealRecords.find((item) => item.id === input.id)
        : null;
      const record = {
        ...existing,
        ...input,
        id: input.id || createId("meal-record"),
        photoId,
        source: input.sourceId ? input.sourceType : "manual",
        schemaVersion: 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        deletedAt: null,
      };
      upsertItem("mealRecords", record);
      if (existing?.photoId && existing.photoId !== photoId) await deletePhoto(existing.photoId).catch(() => {});
      state.dirty = false;
      showList();
      showToast(existing ? "记录已更新。" : "记录已保存。");
    } catch {
      if (photoId && photoId !== state.existingPhotoId) await deletePhoto(photoId).catch(() => {});
      elements.recordFormMessage.textContent = "本次未保存，请检查浏览器存储空间后重试。输入已保留。";
    } finally {
      elements.saveRecordButton.disabled = false;
      elements.saveRecordButton.innerHTML = "保存记录 <span>↗</span>";
    }
  }

  function readRecordForm() {
    const costValue = elements.recordCost.value.trim();
    return {
      id: elements.recordId.value,
      sourceId: elements.recordSourceId.value || null,
      mealDate: elements.recordDate.value,
      mealPeriod: elements.recordMealPeriod.value,
      sourceType: elements.recordSourceType.value,
      title: elements.recordTitle.value.trim(),
      foods: elements.recordFoods.value.trim(),
      cost: costValue === "" ? null : Number(costValue),
      partySize: Number(elements.recordPartySize.value),
      feeling: elements.recordFeelingChips.querySelector(".active")?.dataset.value || "great",
      note: elements.recordNote.value.trim(),
    };
  }

  function validateRecord(input) {
    const checks = [
      [elements.recordDate, /^\d{4}-\d{2}-\d{2}$/.test(input.mealDate), "请选择有效日期。"],
      [elements.recordTitle, input.title.length > 0, "餐厅或菜名不能为空。"],
      [elements.recordCost, input.cost === null || (Number.isFinite(input.cost) && input.cost >= 0 && input.cost <= 100000), "花费请填写0至100000之间的金额。"],
      [elements.recordPartySize, Number.isInteger(input.partySize) && input.partySize >= 1 && input.partySize <= 50, "同行人数请填写1至50之间的整数。"],
    ];
    checks.forEach(([element]) => element.classList.remove("invalid"));
    const invalid = checks.find(([, valid]) => !valid);
    if (!invalid) return true;
    invalid[0].classList.add("invalid");
    elements.recordFormMessage.textContent = invalid[2];
    invalid[0].focus();
    return false;
  }

  async function renderList() {
    const renderId = ++state.listRenderId;
    revokeUrls();
    const records = filteredRecords();
    const allCount = readStore().data.mealRecords.filter((item) => !item.deletedAt).length;
    elements.recordCountText.textContent = `${allCount}条记录`;
    if (!records.length) {
      const filtered = state.filter !== "all" || state.dateFilter;
      elements.recordList.innerHTML = `<div class="empty-state"><span class="empty-stamp" aria-hidden="true">记</span><h2>${filtered ? "筛选下没有记录" : "还没有饮食记录"}</h2><p>${filtered ? "清除筛选后查看全部记录。" : "从今天这一餐开始，记下第一笔。"}</p><button class="primary-compact" type="button" data-empty-action>${filtered ? "清除筛选" : "新建第一条"}</button></div>`;
      elements.recordList.querySelector("[data-empty-action]").onclick = filtered ? clearFilters : () => openEditor();
      return;
    }
    const rows = await Promise.all(records.map(async (record) => {
      let photo = "";
      if (record.photoId) {
        const stored = await getPhoto(record.photoId).catch(() => null);
        photo = photoObjectUrl(stored);
        if (photo) trackUrl(photo);
      }
      return `<button class="record-item" data-record-id="${escapeHtml(record.id)}" type="button">
        <time datetime="${escapeHtml(record.mealDate)}">${escapeHtml(record.mealDate.slice(5))}<br />${escapeHtml(record.mealPeriod)}</time>
        <span><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(SOURCE_LABELS[record.sourceType])}${record.foods ? ` · ${escapeHtml(record.foods)}` : ""}<br />${escapeHtml(FEELING_LABELS[record.feeling] || "")}</p></span>
        ${photo ? `<img class="record-thumb" src="${photo}" alt="${escapeHtml(record.title)}记录照片" />` : record.cost === null ? "" : `<strong class="record-cost">¥${escapeHtml(record.cost)}</strong>`}
      </button>`;
    }));
    if (renderId !== state.listRenderId) return;
    elements.recordList.innerHTML = rows.join("");
  }

  function filteredRecords() {
    return readStore().data.mealRecords
      .filter((item) => !item.deletedAt)
      .filter((item) => state.filter === "all" || item.sourceType === state.filter)
      .filter((item) => !state.dateFilter || item.mealDate === state.dateFilter)
      .sort((a, b) =>
        b.mealDate.localeCompare(a.mealDate) ||
        (PERIOD_ORDER[b.mealPeriod] || 0) - (PERIOD_ORDER[a.mealPeriod] || 0) ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
  }

  async function showDetail(id) {
    const record = readStore().data.mealRecords.find((item) => item.id === id && !item.deletedAt);
    if (!record) return;
    const loadId = ++state.detailLoadId;
    state.detailId = id;
    const photo = record.photoId ? await getPhoto(record.photoId).catch(() => null) : null;
    if (loadId !== state.detailLoadId || state.detailId !== id) return;
    const photoUrl = photoObjectUrl(photo);
    if (photoUrl) trackUrl(photoUrl);
    const values = [
      ["日期与餐次", `${record.mealDate} · ${record.mealPeriod}`],
      ["用餐方式", SOURCE_LABELS[record.sourceType]],
      ["餐厅或菜名", record.title],
      ["吃了什么", record.foods],
      ["花费", record.cost === null ? "" : `¥${record.cost}`],
      ["同行人数", `${record.partySize}人`],
      ["感受", FEELING_LABELS[record.feeling]],
      ["备注", record.note],
    ].filter(([, value]) => String(value || "").trim());
    elements.recordDetail.innerHTML = `<article class="record-detail-card">
      <p class="eyebrow">饮食记录</p><h1 tabindex="-1">${escapeHtml(record.title)}</h1>
      ${photoUrl ? `<img src="${photoUrl}" alt="${escapeHtml(record.title)}记录照片" />` : ""}
      <dl>${values.map(([label, value]) => `<div class="detail-row"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      <div class="detail-actions"><button class="primary-compact" data-detail-action="edit" type="button">编辑</button><button class="danger-button" data-detail-action="delete" type="button">× 删除</button></div>
    </article>`;
    elements.recordDetail.querySelector("[data-detail-action='edit']").onclick = () => openEditor(record);
    elements.recordDetail.querySelector("[data-detail-action='delete']").onclick = (event) => confirmDelete(record, event.currentTarget);
    showView(elements.recordDetailView);
    elements.recordDetail.querySelector("h1").focus();
  }

  function confirmDelete(record, trigger) {
    openModal({
      title: "删除这条记录？",
      content: "<p>记录会先从列表移除，并提供10秒撤销。超时后关联照片会永久清理。</p>",
      danger: true,
      trigger,
      actions: [
        { label: "取消" },
        { label: "删除", className: "primary-action", onClick: () => softDelete(record) },
      ],
    });
  }

  function softDelete(record) {
    const deletedAt = new Date().toISOString();
    try {
      upsertItem("mealRecords", { ...record, deletedAt, updatedAt: deletedAt });
      showList();
      startDeleteCountdown(record, deletedAt, 10_000);
    } catch {
      showToast("本次删除未保存。");
    }
  }

  function recoverDeletedRecords() {
    const now = Date.now();
    readStore().data.mealRecords
      .filter((record) => record.deletedAt)
      .forEach((record) => {
        const deletedAtMs = Date.parse(record.deletedAt);
        const remainingMs = Number.isFinite(deletedAtMs) ? 10_000 - (now - deletedAtMs) : 0;
        if (remainingMs > 0) startDeleteCountdown(record, record.deletedAt, remainingMs);
        else finalizeDelete(record, record.deletedAt);
      });
  }

  function startDeleteCountdown(record, deletedAt, remainingMs) {
    let remaining = Math.max(1, Math.ceil(remainingMs / 1000));
    let interval;
    const toast = showToast("记录已删除", {
      actionLabel: "撤销",
      countdown: remaining,
      persistent: true,
      onAction: () => {
        clearInterval(interval);
        const latest = readStore().data.mealRecords.find((item) => item.id === record.id);
        if (latest?.deletedAt === deletedAt) {
          upsertItem("mealRecords", { ...latest, deletedAt: null, updatedAt: new Date().toISOString() });
        }
        toast.close();
        renderList();
      },
    });
    interval = setInterval(() => {
      remaining -= 1;
      toast.setCountdown(Math.max(0, remaining));
      if (remaining > 0) return;
      clearInterval(interval);
      toast.close();
      finalizeDelete(record, deletedAt);
    }, 1000);
  }

  async function finalizeDelete(record, deletedAt) {
    const latest = readStore().data.mealRecords.find((item) => item.id === record.id);
    if (latest?.deletedAt !== deletedAt) return;
    try {
      removeItem("mealRecords", record.id);
      await deletePhoto(record.photoId);
      renderList();
    } catch {
      showToast("记录已移除，但照片清理失败，可在“我的”中清除本地数据。");
    }
  }

  function clearFilters() {
    state.filter = "all";
    state.dateFilter = "";
    elements.recordDateFilter.value = "";
    setChipSelection(elements.recordFilterChips, "all", false);
    renderList();
  }

  function showList() {
    state.detailId = null;
    state.detailLoadId += 1;
    state.previewLoadId += 1;
    showView(elements.recordListView);
    renderList();
  }

  function showView(view) {
    [elements.recordListView, elements.recordEditorView, elements.recordDetailView].forEach(
      (item) => { item.hidden = item !== view; }
    );
  }

  async function renderExistingPhoto(photoId) {
    const loadId = ++state.previewLoadId;
    const record = await getPhoto(photoId).catch(() => null);
    if (loadId !== state.previewLoadId || state.existingPhotoId !== photoId) return;
    const url = photoObjectUrl(record);
    if (!url) return;
    trackUrl(url);
    elements.recordPhotoPreview.querySelector("img").src = url;
    elements.recordPhotoPreview.hidden = false;
  }

  function trackUrl(url) {
    state.objectUrls.add(url);
  }

  function revokeUrls() {
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls.clear();
  }

  return {
    openEditor,
    showList,
    refresh: renderList,
    canLeave() {
      return elements.recordEditorView.hidden || !state.dirty || window.confirm("有尚未保存的修改，确定放弃吗？");
    },
    openRecord(id) {
      showDetail(id);
    },
  };
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function collectElements() {
  const ids = [
    "recordListView", "recordEditorView", "recordDetailView", "recordCountText",
    "newRecordButton", "recordFilterChips", "recordDateFilter", "clearRecordFilters",
    "recordList", "recordEditorBack", "recordDetailBack", "recordSourceHint",
    "recordEditorHeading", "recordForm", "recordId", "recordSourceId", "recordDate",
    "recordMealPeriod", "recordSourceType", "recordTitle", "recordFoods", "recordCost",
    "recordPartySize", "recordFeelingChips", "recordNote", "recordPhoto",
    "recordPhotoPreview", "removeRecordPhoto", "recordPhotoMessage", "saveRecordButton",
    "recordFormMessage", "recordDetail",
  ];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}
