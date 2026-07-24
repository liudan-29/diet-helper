const restaurants = [
  {
    name: "胡记锅贴",
    meta: "锅贴 · 420m · 人均 ¥36",
    rating: "4.8",
    stamp: "川",
    kicker: "锅气很足",
    reason: "离你近，正在营业；午餐吃得扎实，又不会花太多时间。",
    tags: ["正在营业", "上餐快", "适合一人"],
    color: "linear-gradient(135deg, #e27d3d, #d84d2b 55%, #5e3a25)",
  },
  {
    name: "青禾小馆",
    meta: "江浙菜 · 650m · 人均 ¥72",
    rating: "4.7",
    stamp: "鲜",
    kicker: "今天想吃清爽一点",
    reason: "菜品选择多，口味不重；日常午餐也能坐得舒服。",
    tags: ["蔬菜丰富", "可选小份", "环境安静"],
    color: "linear-gradient(135deg, #779653, #3f6d54 58%, #23443d)",
  },
  {
    name: "潮汕牛肉粿条",
    meta: "潮汕菜 · 380m · 人均 ¥42",
    rating: "4.6",
    stamp: "牛",
    kicker: "热汤暖胃",
    reason: "距离最近的一家，出餐稳定；适合想快速吃上一顿热乎的午餐。",
    tags: ["距离近", "出餐快", "热汤"],
    color: "linear-gradient(135deg, #9c493a, #602e2b 58%, #302521)",
  },
  {
    name: "山野菌子火锅",
    meta: "火锅 · 880m · 人均 ¥118",
    rating: "4.9",
    stamp: "菌",
    kicker: "适合慢慢吃一顿",
    reason: "评分很高，适合有充足时间的聚餐；已经为午餐场景降低了优先级。",
    tags: ["评分高", "适合请客", "可预约"],
    color: "linear-gradient(135deg, #c3a55a, #785e3c 60%, #3f3927)",
  },
];

const state = { meal: "午餐", scene: "日常", budget: 80, index: 0, located: false };
const elements = {
  locationButton: document.querySelector("#locationButton"),
  locationText: document.querySelector("#locationText"),
  budgetRange: document.querySelector("#budgetRange"),
  budgetOutput: document.querySelector("#budgetOutput"),
  recommendButton: document.querySelector("#recommendButton"),
  nextButton: document.querySelector("#nextButton"),
  navigateButton: document.querySelector("#navigateButton"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCount: document.querySelector("#resultCount"),
  restaurantCard: document.querySelector("#restaurantCard"),
  cardVisual: document.querySelector("#cardVisual"),
  restaurantName: document.querySelector("#restaurantName"),
  restaurantMeta: document.querySelector("#restaurantMeta"),
  restaurantRating: document.querySelector("#restaurantRating"),
  dishStamp: document.querySelector("#dishStamp"),
  cardKicker: document.querySelector("#cardKicker"),
  restaurantReason: document.querySelector("#restaurantReason"),
  tagList: document.querySelector("#tagList"),
  dataNote: document.querySelector("#dataNote"),
};

function renderRestaurant() {
  const item = restaurants[state.index];
  elements.resultTitle.textContent = `附近适合${state.meal}的店`;
  elements.resultCount.textContent = `${String(state.index + 1).padStart(2, "0")} / ${String(restaurants.length).padStart(2, "0")}`;
  elements.cardVisual.style.background = item.color;
  elements.restaurantName.textContent = item.name;
  elements.restaurantMeta.textContent = item.meta;
  elements.restaurantRating.textContent = item.rating;
  elements.dishStamp.textContent = item.stamp;
  elements.cardKicker.textContent = item.kicker;
  elements.restaurantReason.textContent = item.reason;
  elements.tagList.innerHTML = item.tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
  elements.restaurantCard.style.animation = "none";
  requestAnimationFrame(() => { elements.restaurantCard.style.animation = "cardIn .45s ease both"; });
}

document.querySelectorAll(".chip-group").forEach((group) => {
  group.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    group.querySelectorAll(".chip").forEach((button) => button.classList.toggle("active", button === chip));
    state[group.dataset.group] = chip.dataset.value;
  });
});

elements.budgetRange.addEventListener("input", (event) => {
  state.budget = Number(event.target.value);
  elements.budgetOutput.value = `¥${state.budget}`;
  elements.budgetOutput.textContent = `¥${state.budget}`;
});

elements.locationButton.addEventListener("click", () => {
  state.located = !state.located;
  elements.locationText.textContent = state.located ? "已定位 · 周边 1km" : "定位到附近";
  elements.dataNote.textContent = state.located
    ? "演示定位已开启。接入高德 MCP 后，将按你的真实位置获取餐厅。"
    : "现在是演示数据。接入高德 MCP 后，这里会显示附近真实餐厅。";
});

elements.recommendButton.addEventListener("click", () => {
  state.index = 0;
  renderRestaurant();
  document.querySelector("#resultSection").scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.nextButton.addEventListener("click", () => {
  state.index = (state.index + 1) % restaurants.length;
  renderRestaurant();
});

elements.navigateButton.addEventListener("click", () => {
  elements.navigateButton.textContent = "接入高德后导航 →";
  setTimeout(() => { elements.navigateButton.innerHTML = "去这里 <span>→</span>"; }, 1700);
});

renderRestaurant();
