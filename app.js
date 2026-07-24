const DEFAULT_TEST_LOCATION = {
  latitude: 39.908823,
  longitude: 116.39747,
  label: "北京·测试位置",
};

const currentHour = new Date().getHours();
const defaultMeal =
  currentHour < 10 ? "早餐" : currentHour < 15 ? "午餐" : currentHour < 21 ? "晚餐" : "夜宵";

const state = {
  meal: defaultMeal,
  occasion: "日常",
  customOccasion: "",
  partySize: null,
  tastePreferences: [],
  customRequirement: "",
  budget: 80,
  radius: 1000,
  location: null,
  restaurants: [],
  index: 0,
  loading: false,
  dataMode: "mock",
  search: null,
  photoIndexByRestaurant: {},
  failedPhotos: new Set(),
  photoPromises: new Map(),
};

const elements = {
  locationButton: document.querySelector("#locationButton"),
  locationText: document.querySelector("#locationText"),
  locationPanel: document.querySelector("#locationPanel"),
  manualLocationInput: document.querySelector("#manualLocationInput"),
  manualLocationButton: document.querySelector("#manualLocationButton"),
  budgetInput: document.querySelector("#budgetInput"),
  customOccasionField: document.querySelector("#customOccasionField"),
  customOccasionInput: document.querySelector("#customOccasionInput"),
  partySizeInput: document.querySelector("#partySizeInput"),
  customRequirementInput: document.querySelector("#customRequirementInput"),
  recommendButton: document.querySelector("#recommendButton"),
  formMessage: document.querySelector("#formMessage"),
  resultSection: document.querySelector("#resultSection"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  navigateButton: document.querySelector("#navigateButton"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCount: document.querySelector("#resultCount"),
  restaurantCard: document.querySelector("#restaurantCard"),
  cardVisual: document.querySelector("#cardVisual"),
  restaurantPhoto: document.querySelector("#restaurantPhoto"),
  photoSource: document.querySelector("#photoSource"),
  photoPreviousButton: document.querySelector("#photoPreviousButton"),
  photoNextButton: document.querySelector("#photoNextButton"),
  photoPagination: document.querySelector("#photoPagination"),
  restaurantName: document.querySelector("#restaurantName"),
  restaurantMeta: document.querySelector("#restaurantMeta"),
  restaurantRating: document.querySelector("#restaurantRating"),
  dishStamp: document.querySelector("#dishStamp"),
  cardKicker: document.querySelector("#cardKicker"),
  restaurantReason: document.querySelector("#restaurantReason"),
  tagList: document.querySelector("#tagList"),
  dataNote: document.querySelector("#dataNote"),
};

setDefaultMealChip();
elements.resultSection.hidden = true;

function setDefaultMealChip() {
  const group = document.querySelector('[data-group="meal"]');
  group.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.value === defaultMeal);
  });
}

function renderRestaurant() {
  const item = state.restaurants[state.index];
  if (!item) {
    elements.resultSection.hidden = false;
    elements.restaurantCard.hidden = true;
    elements.resultTitle.textContent = "附近暂时没有合适结果";
    elements.resultCount.textContent = "00 / 00";
    elements.dataNote.textContent = "可以提高预算、修改场景或稍后扩大搜索范围。";
    return;
  }

  elements.restaurantCard.hidden = false;
  elements.resultTitle.textContent = `${state.location.label}附近的${state.meal}`;
  elements.resultCount.textContent = `${String(state.index + 1).padStart(2, "0")} / ${String(
    state.restaurants.length
  ).padStart(2, "0")}`;
  elements.cardVisual.style.background = visualGradient(item.category, state.index);
  renderRestaurantPhoto(item);
  elements.restaurantName.textContent = item.name;
  elements.restaurantMeta.textContent = restaurantMeta(item);
  elements.restaurantRating.hidden = item.rating === null;
  elements.restaurantRating.textContent = item.rating?.toFixed?.(1) || item.rating || "";
  elements.dishStamp.textContent = stampFor(item);
  elements.cardKicker.textContent = item.reasons?.[0] || "附近可选";
  elements.restaurantReason.textContent = buildReason(item);
  elements.tagList.innerHTML = [
    ...(item.businessStatus === "open" ? ["正在营业"] : []),
    ...(item.reasons || []),
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4)
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");

  elements.previousButton.disabled = state.index === 0;
  elements.nextButton.textContent =
    state.index === state.restaurants.length - 1 ? "回到第一家" : "换一家";
  elements.navigateButton.disabled = !item.navigationUrl;
  elements.restaurantCard.style.animation = "none";
  requestAnimationFrame(() => {
    elements.restaurantCard.style.animation = "cardIn .45s ease both";
  });
  recordEvent("view", item.id);
}

function renderRestaurantPhoto(item) {
  const photoUrls = restaurantPhotoUrls(item);
  const currentIndex = Math.min(
    state.photoIndexByRestaurant[item.id] || 0,
    Math.max(0, photoUrls.length - 1)
  );
  const photoUrl = photoUrls[currentIndex] || "";
  state.photoIndexByRestaurant[item.id] = currentIndex;
  elements.restaurantPhoto.dataset.pendingPhotoUrl = photoUrl;
  renderPhotoControls(item, photoUrls, currentIndex);

  if (!photoUrl) {
    elements.cardVisual.classList.remove("has-photo", "photo-loading");
    elements.restaurantPhoto.removeAttribute("src");
    elements.restaurantPhoto.alt = "";
    elements.restaurantPhoto.dataset.photoUrl = "";
    return;
  }

  elements.cardVisual.classList.add("photo-loading");
  preloadRestaurantPhotos(photoUrls);
  loadPhoto(photoUrl)
    .then(() => {
      if (elements.restaurantPhoto.dataset.pendingPhotoUrl !== photoUrl) return;
      elements.restaurantPhoto.onload = () => {
        if (elements.restaurantPhoto.dataset.pendingPhotoUrl !== photoUrl) return;
        elements.restaurantPhoto.dataset.photoUrl = photoUrl;
        elements.cardVisual.classList.add("has-photo");
        elements.cardVisual.classList.remove("photo-loading");
      };
      elements.restaurantPhoto.alt = `${item.name}实景照片，第${currentIndex + 1}张，共${photoUrls.length}张`;
      elements.restaurantPhoto.src = photoUrl;
      if (elements.restaurantPhoto.complete && elements.restaurantPhoto.naturalWidth > 0) {
        elements.restaurantPhoto.onload();
      }
    })
    .catch(() => {
      if (elements.restaurantPhoto.dataset.pendingPhotoUrl !== photoUrl) return;
      renderRestaurantPhoto(item);
    });
}

function preloadRestaurantPhotos(photoUrls) {
  photoUrls.forEach((photoUrl) => {
    loadPhoto(photoUrl).catch(() => {});
  });
}

function loadPhoto(photoUrl) {
  if (state.photoPromises.has(photoUrl)) {
    return state.photoPromises.get(photoUrl);
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = resolve;
    image.onerror = () => reject(new Error("照片加载失败"));
    image.src = photoUrl;
  }).catch((error) => {
    state.failedPhotos.add(photoUrl);
    throw error;
  });
  state.photoPromises.set(photoUrl, promise);
  return promise;
}

function restaurantPhotoUrls(item) {
  return [...new Set((item.photos || []).map(safePhotoUrl).filter(Boolean))].filter(
    (url) => !state.failedPhotos.has(url)
  );
}

function renderPhotoControls(item, photoUrls, currentIndex) {
  const hasMultiplePhotos = photoUrls.length > 1;
  elements.photoPreviousButton.hidden = !hasMultiplePhotos;
  elements.photoNextButton.hidden = !hasMultiplePhotos;
  elements.photoPagination.hidden = !hasMultiplePhotos;
  elements.photoPagination.innerHTML = hasMultiplePhotos
    ? photoUrls
        .map(
          (_, index) =>
            `<button class="photo-dot${index === currentIndex ? " active" : ""}" type="button" data-photo-index="${index}" aria-label="查看第${index + 1}张照片" aria-current="${index === currentIndex ? "true" : "false"}"></button>`
        )
        .join("")
    : "";
  elements.photoPagination.dataset.restaurantId = item.id;
  elements.photoSource.hidden = photoUrls.length === 0;
  elements.photoSource.textContent = photoUrls.length
    ? `高德实景 · ${currentIndex + 1}/${photoUrls.length}`
    : "";
}

function changeRestaurantPhoto(step) {
  const item = state.restaurants[state.index];
  if (!item) return;
  const photoUrls = restaurantPhotoUrls(item);
  if (photoUrls.length < 2) return;
  const currentIndex = state.photoIndexByRestaurant[item.id] || 0;
  state.photoIndexByRestaurant[item.id] =
    (currentIndex + step + photoUrls.length) % photoUrls.length;
  renderRestaurantPhoto(item);
}

elements.photoPreviousButton.addEventListener("click", (event) => {
  event.stopPropagation();
  changeRestaurantPhoto(-1);
});
elements.photoNextButton.addEventListener("click", (event) => {
  event.stopPropagation();
  changeRestaurantPhoto(1);
});
elements.photoPagination.addEventListener("click", (event) => {
  const dot = event.target.closest("[data-photo-index]");
  const item = state.restaurants[state.index];
  if (!dot || !item) return;
  state.photoIndexByRestaurant[item.id] = Number(dot.dataset.photoIndex);
  renderRestaurantPhoto(item);
});

let touchStart = null;
elements.cardVisual.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  },
  { passive: true }
);
elements.cardVisual.addEventListener(
  "touchend",
  (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const horizontalDistance = touch.clientX - touchStart.x;
    const verticalDistance = touch.clientY - touchStart.y;
    touchStart = null;
    if (
      Math.abs(horizontalDistance) < 40 ||
      Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
    ) {
      return;
    }
    changeRestaurantPhoto(horizontalDistance < 0 ? 1 : -1);
  },
  { passive: true }
);

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

function restaurantMeta(item) {
  const values = [shortCategory(item.category)];
  if (item.distance > 0) values.push(formatDistance(item.distance));
  if (item.averageCost !== null) values.push(`人均 ¥${Math.round(item.averageCost)}`);
  return values.join(" · ");
}

function buildReason(item) {
  const reasons = item.reasons || [];
  const selectedOccasion =
    state.occasion === "其他" ? state.customOccasion : state.occasion;
  const occasion = selectedOccasion === "日常" ? "" : selectedOccasion;
  const party = state.partySize > 1 ? `${state.partySize}人` : "一人";
  if (reasons.length) return `${reasons.join("，")}，符合这次${party}${occasion}${state.meal}的条件。`;
  return `这家店位于本次搜索范围内，可以作为${state.meal}候选。`;
}

function shortCategory(category) {
  return String(category || "餐饮").split(";").filter(Boolean).slice(-1)[0];
}

function stampFor(item) {
  const value = shortCategory(item.category).replace(/餐厅|餐饮|服务|小吃/g, "");
  return value.slice(0, 1) || "食";
}

function formatDistance(distance) {
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)}km`;
  return `${Math.round(distance)}m`;
}

function visualGradient(category, index) {
  const palettes = [
    "linear-gradient(135deg, #e27d3d, #d84d2b 55%, #5e3a25)",
    "linear-gradient(135deg, #779653, #3f6d54 58%, #23443d)",
    "linear-gradient(135deg, #9c493a, #602e2b 58%, #302521)",
    "linear-gradient(135deg, #c3a55a, #785e3c 60%, #3f3927)",
  ];
  if (/轻食|素食|江浙|粤菜/.test(category)) return palettes[1];
  return palettes[index % palettes.length];
}

document.querySelectorAll(".chip-group").forEach((group) => {
  group.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    if (group.dataset.multi === "true") {
      updateTasteSelection(group, chip);
      return;
    }
    group.querySelectorAll(".chip").forEach((button) => {
      button.classList.toggle("active", button === chip);
    });
    state[group.dataset.group] = chip.dataset.value;
    if (group.dataset.group === "occasion") {
      const isCustom = chip.dataset.value === "其他";
      elements.customOccasionField.hidden = !isCustom;
      if (isCustom) elements.customOccasionInput.focus();
    }
  });
});

function updateTasteSelection(group, chip) {
  if (chip.dataset.value === "不限") {
    group.querySelectorAll(".chip").forEach((button) => {
      button.classList.toggle("active", button === chip);
    });
    state.tastePreferences = [];
    return;
  }

  chip.classList.toggle("active");
  group.querySelector('[data-value="不限"]').classList.remove("active");
  state.tastePreferences = [...group.querySelectorAll(".chip.active")].map(
    (button) => button.dataset.value
  );
  if (!state.tastePreferences.length) {
    group.querySelector('[data-value="不限"]').classList.add("active");
  }
}

elements.partySizeInput.addEventListener("input", (event) => {
  state.partySize = Number(event.target.value);
});
elements.customOccasionInput.addEventListener("input", (event) => {
  state.customOccasion = event.target.value;
});
elements.customRequirementInput.addEventListener("input", (event) => {
  state.customRequirement = event.target.value;
});

elements.locationButton.addEventListener("click", locateUser);
elements.manualLocationButton.addEventListener("click", useManualLocation);

function locateUser() {
  elements.formMessage.textContent = "";
  if (!navigator.geolocation) {
    showManualLocation("当前浏览器不支持定位，请输入测试地点。");
    return;
  }

  elements.locationButton.disabled = true;
  elements.locationText.textContent = "正在定位…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: "当前位置",
      };
      elements.locationText.textContent = "已定位 · 周边 1km";
      elements.locationButton.disabled = false;
      elements.locationPanel.hidden = true;
      elements.formMessage.textContent = "";
    },
    () => {
      elements.locationButton.disabled = false;
      elements.locationText.textContent = "定位未完成";
      showManualLocation("没有获得定位权限，可以输入地点继续体验。");
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
  );
}

function showManualLocation(message) {
  elements.locationPanel.hidden = false;
  elements.formMessage.textContent = message;
  elements.manualLocationInput.focus();
}

function useManualLocation() {
  const label = elements.manualLocationInput.value.trim();
  if (!label) {
    elements.formMessage.textContent = "请输入一个地点名称。";
    return;
  }
  state.location = { ...DEFAULT_TEST_LOCATION, label: `${label} · 测试坐标` };
  elements.locationText.textContent = label;
  elements.locationPanel.hidden = true;
  elements.formMessage.textContent = "手动地点暂用测试坐标；配置高德后会接入地点解析。";
}

elements.recommendButton.addEventListener("click", requestRecommendations);

async function requestRecommendations() {
  if (state.loading) return;
  if (!state.location) {
    showManualLocation("请先定位或输入地点。");
    return;
  }
  const budget = Number(elements.budgetInput.value);
  if (
    elements.budgetInput.value.trim() === "" ||
    !Number.isFinite(budget) ||
    budget < 0 ||
    budget > 10000
  ) {
    elements.formMessage.textContent = "人均预算请填写0至10000之间的金额。";
    elements.budgetInput.focus();
    return;
  }
  const partySize = Number(elements.partySizeInput.value);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    elements.formMessage.textContent = "同行人数请填写1至50之间的整数。";
    elements.partySizeInput.focus();
    return;
  }
  const customOccasion = elements.customOccasionInput.value.trim();
  if (state.occasion === "其他" && !customOccasion) {
    elements.formMessage.textContent = "请填写这次的用餐场合。";
    elements.customOccasionInput.focus();
    return;
  }
  state.budget = budget;
  state.partySize = partySize;
  state.customOccasion = customOccasion;
  state.customRequirement = elements.customRequirementInput.value.trim();

  setLoading(true);
  elements.formMessage.textContent = "正在查询附近餐厅并筛选…";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "查询失败");

    state.restaurants = payload.restaurants || [];
    state.index = 0;
    state.dataMode = payload.mode;
    state.search = payload.search || null;
    elements.resultSection.hidden = false;
    renderRestaurant();
    elements.dataNote.textContent = buildDataNote();
    elements.formMessage.textContent = "";
    elements.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const message =
      error.name === "AbortError" ? "查询超过25秒，请重试。" : `${error.message}，请重试。`;
    elements.formMessage.textContent = message;
  } finally {
    clearTimeout(timeout);
    setLoading(false);
  }
}

function buildDataNote() {
  if (state.dataMode !== "amap-mcp") {
    return "当前使用演示数据。配置AMAP_MCP_KEY后会自动切换为高德真实餐厅。";
  }
  if (state.search?.expanded) {
    return `餐厅数据来自高德MCP；候选不足时已自动扩大到${formatDistance(
      state.search.usedRadius
    )}，共找到${state.restaurants.length}家合适餐厅。`;
  }
  return `餐厅数据来自高德MCP；本次共找到${state.restaurants.length}家合适餐厅。`;
}

function setLoading(loading) {
  state.loading = loading;
  elements.recommendButton.disabled = loading;
  elements.recommendButton.innerHTML = loading
    ? "正在认真挑选… <span>···</span>"
    : "给我挑一家 <span>↗</span>";
}

elements.previousButton.addEventListener("click", () => {
  if (state.index === 0) return;
  state.index -= 1;
  renderRestaurant();
});

elements.nextButton.addEventListener("click", () => {
  const current = state.restaurants[state.index];
  if (current) recordEvent("skip", current.id);
  state.index = (state.index + 1) % state.restaurants.length;
  renderRestaurant();
});

elements.navigateButton.addEventListener("click", () => {
  const item = state.restaurants[state.index];
  if (!item?.navigationUrl) return;
  recordEvent("navigate", item.id);
  window.open(item.navigationUrl, "_blank", "noopener,noreferrer");
});

function recordEvent(type, restaurantId) {
  const events = JSON.parse(localStorage.getItem("diet-helper-events") || "[]");
  events.push({
    type,
    restaurantId,
    mealPeriod: state.meal,
    occasion: state.occasion === "其他" ? state.customOccasion : state.occasion,
    partySize: state.partySize,
    tastePreferences: state.tastePreferences,
    customRequirement: state.customRequirement,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem("diet-helper-events", JSON.stringify(events.slice(-200)));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
