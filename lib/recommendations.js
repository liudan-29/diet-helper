const BREAKFAST_WORDS = /早餐|油条|包子|豆浆|粥|煎饼|肠粉/;
const QUICK_MEAL_WORDS = /快餐|小吃|美食城|档口|汉堡|炸鸡/;
const ALLOWED_TASTES = new Set(["清淡", "辣", "少油", "素食"]);
const CUSTOM_PREFERENCE_RULES = [
  { pattern: /火锅/, keywords: "火锅", restaurant: /火锅/ },
  { pattern: /烤肉|烧烤/, keywords: "烤肉|烧烤", restaurant: /烤肉|烧烤/ },
  { pattern: /面条|面食|面馆|拉面/, keywords: "面馆|拉面|面食", restaurant: /面馆|拉面|面食|面条/ },
  { pattern: /米粉|粉面|螺蛳粉/, keywords: "米粉|粉面", restaurant: /米粉|粉面|螺蛳粉/ },
  { pattern: /日料|日本料理|寿司/, keywords: "日本料理|日料|寿司", restaurant: /日本料理|日料|寿司/ },
  { pattern: /西餐/, keywords: "西餐厅|西餐", restaurant: /西餐/ },
  { pattern: /粤菜/, keywords: "粤菜", restaurant: /粤菜/ },
  { pattern: /川菜/, keywords: "川菜", restaurant: /川菜/ },
  { pattern: /湘菜/, keywords: "湘菜", restaurant: /湘菜/ },
  { pattern: /甜品|甜点/, keywords: "甜品|甜点", restaurant: /甜品|甜点/ },
];
const MEAL_WINDOWS = {
  早餐: [6 * 60, 10 * 60 + 30],
  午餐: [11 * 60, 14 * 60 + 30],
  晚餐: [17 * 60, 21 * 60],
  夜宵: [21 * 60, 26 * 60],
};

export const DEFAULT_RADIUS = 1000;

export function validateMealRequest(input) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const budget = Number(input.budget);
  const radius = Number(input.radius ?? DEFAULT_RADIUS);
  const legacyScene = String(input.scene || "").trim();
  const occasionPreset = String(
    input.occasion || (legacyScene === "一个人" || legacyScene === "想吃清淡" ? "日常" : legacyScene)
  ).trim();
  const customOccasion = String(input.customOccasion || "").trim();
  const partySize = Number(input.partySize ?? 1);
  const tastePreferences = Array.isArray(input.tastePreferences)
    ? [...new Set(input.tastePreferences.map((value) => String(value).trim()))]
    : [];
  if (legacyScene === "想吃清淡" && !tastePreferences.includes("清淡")) {
    tastePreferences.push("清淡");
  }
  const customRequirement = String(input.customRequirement || "").trim();

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("纬度无效");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("经度无效");
  }
  if (!["早餐", "午餐", "晚餐", "夜宵"].includes(input.mealPeriod)) {
    throw new Error("餐次无效");
  }
  if (!occasionPreset) {
    throw new Error("用餐场景无效");
  }
  if (occasionPreset.length > 20 || customOccasion.length > 20) {
    throw new Error("用餐场景过长");
  }
  if (occasionPreset === "其他" && !customOccasion) {
    throw new Error("请填写自定义用餐场景");
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    throw new Error("同行人数无效");
  }
  if (tastePreferences.some((value) => !ALLOWED_TASTES.has(value))) {
    throw new Error("口味偏好无效");
  }
  if (customRequirement.length > 80) {
    throw new Error("其他要求过长");
  }
  if (!Number.isFinite(budget) || budget < 1 || budget > 10000) {
    throw new Error("预算无效");
  }
  if (!Number.isFinite(radius) || radius < 100 || radius > 50000) {
    throw new Error("搜索范围无效");
  }

  return {
    latitude,
    longitude,
    mealPeriod: input.mealPeriod,
    occasion: occasionPreset === "其他" ? customOccasion : occasionPreset,
    occasionPreset,
    partySize,
    tastePreferences,
    customRequirement,
    budget,
    radius,
    locationLabel: String(input.locationLabel || "当前位置").slice(0, 80),
  };
}

export function buildSearchKeywords(request) {
  if (request.mealPeriod === "早餐") return "早餐|包子|粥|面包";
  if (request.mealPeriod === "夜宵") return "夜宵|烧烤|火锅|小龙虾";
  const customPreference = parseCustomPreference(request.customRequirement);
  if (customPreference.positive.length) return customPreference.positive[0].keywords;
  if (request.occasionPreset === "其他") return `${request.occasion}|餐厅`;
  if (request.tastePreferences?.includes("素食")) return "素食|蔬食|轻食";
  if (request.tastePreferences?.some((taste) => ["清淡", "少油"].includes(taste))) {
    return "轻食|粤菜|江浙菜|素食";
  }
  if (request.tastePreferences?.includes("辣")) return "川菜|湘菜|重庆火锅|麻辣烫";
  if (request.occasion === "请客") return "中餐厅|私房菜|特色餐厅";
  if (request.partySize >= 6 || request.occasion === "聚餐") return "中餐厅|火锅|烤肉|酒楼";
  return "餐厅|中餐|面馆|小吃";
}

export function buildSupplementalSearchKeywords(request) {
  if (request.mealPeriod === "早餐") {
    return ["豆浆|油条|煎饼|肠粉", "馄饨|面馆|小吃|快餐"];
  }
  if (request.mealPeriod === "夜宵") {
    return ["串串|烤肉|大排档|夜市", "餐厅|小吃|快餐|便利店"];
  }
  const customPreference = parseCustomPreference(request.customRequirement);
  if (customPreference.positive.length) {
    return ["地方菜|简餐|特色餐厅", "餐厅|中餐|西餐|小吃"];
  }
  if (request.tastePreferences?.some((taste) => ["清淡", "少油"].includes(taste))) {
    return ["粥|汤|面馆|简餐", "餐厅|中餐|快餐|小吃"];
  }
  if (request.tastePreferences?.includes("辣")) {
    return ["麻辣香锅|串串|烤鱼|火锅", "餐厅|中餐|小吃|快餐"];
  }
  if (request.tastePreferences?.includes("素食")) {
    return ["轻食|蔬菜|斋菜|简餐", "餐厅|中餐|快餐|小吃"];
  }
  if (request.occasion === "请客") {
    return ["地方菜|宴会厅|酒楼|融合菜", "中餐厅|西餐厅|火锅|烤肉"];
  }
  if (request.partySize >= 6 || request.occasion === "聚餐") {
    return ["地方菜|宴会厅|聚餐|融合菜", "中餐厅|西餐厅|火锅|烤肉"];
  }
  return ["地方菜|快餐|简餐|粉面", "火锅|烤肉|西餐|特色餐厅"];
}

export function normalizePoi(poi, request) {
  const location = String(poi.location || poi.location_string || "").split(",");
  const longitude = Number(location[0]);
  const latitude = Number(location[1]);
  const business = poi.business || poi.biz_ext || {};
  const photos = Array.isArray(poi.photos)
    ? poi.photos.map((photo) => photo.url || photo).filter(Boolean)
    : poi.photo
      ? [poi.photo]
      : [];
  const businessHours =
    business.opentime_today ||
    business.opentime_week ||
    poi.open_time ||
    poi.opentime2 ||
    poi.opentime ||
    "";
  const explicitBusinessStatus = normalizeBusinessStatus(
    business.business_status ?? poi.business_status ?? poi.status
  );

  return {
    id: String(poi.id || poi.poiid || `${poi.name}-${poi.location}`),
    name: String(poi.name || "").trim(),
    address: String(poi.address || poi.pname || "地址暂缺"),
    longitude,
    latitude,
    distance: Number(
      poi.distance ??
        distanceInMeters(
          request.latitude,
          request.longitude,
          latitude,
          longitude
        )
    ),
    category: String(poi.type || poi.typecode || "餐饮"),
    rating: numberOrNull(business.rating ?? poi.rating),
    averageCost: numberOrNull(business.cost ?? poi.cost ?? poi.average_cost),
    businessStatus:
      explicitBusinessStatus === "unknown"
        ? inferBusinessStatus(businessHours)
        : explicitBusinessStatus,
    businessHours,
    phone: String(poi.tel || ""),
    photos,
    navigationUrl: buildNavigationUrl(poi, longitude, latitude),
    source: "amap",
    requestLocation: request.locationLabel,
  };
}

function distanceInMeters(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  if (![fromLatitude, fromLongitude, toLatitude, toLongitude].every(Number.isFinite)) {
    return 0;
  }
  const earthRadius = 6_371_000;
  const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
  const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(degreesToRadians(fromLatitude)) *
      Math.cos(degreesToRadians(toLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function numberOrNull(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferBusinessStatus(hoursText) {
  const ranges = parseBusinessHourRanges(hoursText);
  if (!ranges.length) return "unknown";

  const nowParts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(nowParts.find((part) => part.type === "hour")?.value);
  const minute = Number(nowParts.find((part) => part.type === "minute")?.value);
  const current = hour * 60 + minute;
  const isOpen = ranges.some(({ start, end }) => {
    const normalizedCurrent = current < start && end > 24 * 60 ? current + 24 * 60 : current;
    return normalizedCurrent >= start && normalizedCurrent <= end;
  });
  return isOpen ? "open" : "closed";
}

function parseBusinessHourRanges(hoursText) {
  const matches = String(hoursText).matchAll(
    /(\d{1,2}):(\d{2})\s*(?:-|~|—|至)\s*(\d{1,2}):(\d{2})/g
  );
  return Array.from(matches, (match) => {
    const startHour = Number(match[1]);
    const startMinute = Number(match[2]);
    const endHour = Number(match[3]);
    const endMinute = Number(match[4]);
    if (
      startHour > 24 ||
      endHour > 24 ||
      startMinute > 59 ||
      endMinute > 59 ||
      (startHour === 24 && startMinute !== 0) ||
      (endHour === 24 && endMinute !== 0)
    ) {
      return null;
    }
    const start = startHour * 60 + startMinute;
    let end = endHour * 60 + endMinute;
    if (end <= start) end += 24 * 60;
    return { start, end };
  }).filter(Boolean);
}

export function businessHoursOverlapMeal(hoursText, mealPeriod) {
  const mealWindow = MEAL_WINDOWS[mealPeriod];
  const ranges = parseBusinessHourRanges(hoursText);
  if (!mealWindow || !ranges.length) return null;
  const [mealStart, mealEnd] = mealWindow;
  return ranges.some(({ start, end }) =>
    [
      { start, end },
      { start: start + 24 * 60, end: end + 24 * 60 },
    ].some((range) => range.start < mealEnd && range.end > mealStart)
  );
}

function normalizeBusinessStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["0", "closed", "已关闭", "闭店", "歇业"].includes(status)) return "closed";
  if (["1", "open", "营业", "营业中"].includes(status)) return "open";
  return "unknown";
}

function buildNavigationUrl(poi, longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return "";
  const destination = `${longitude},${latitude},${String(poi.name || "目的地")}`;
  const params = new URLSearchParams({
    to: destination,
    mode: "walk",
    policy: "1",
    src: "diet-helper",
    coordinate: "gaode",
    callnative: "1",
  });
  return `https://uri.amap.com/navigation?${params.toString()}`;
}

export function rankRestaurants(restaurants, request) {
  return restaurants
    .filter((restaurant) => isEligible(restaurant, request))
    .map((restaurant) => {
      const reasons = [];
      let score = 0;

      if (restaurant.distance > 0) {
        score += Math.max(0, 30 - restaurant.distance / 50);
        if (restaurant.distance <= 500) reasons.push("步行距离近");
      }
      if (restaurant.rating !== null) {
        score += restaurant.rating * 4;
        if (restaurant.rating >= 4.5) reasons.push("评分较高");
      }
      if (restaurant.averageCost !== null) {
        const difference = Math.abs(request.budget - restaurant.averageCost);
        score += Math.max(0, 20 - difference / 5);
        if (restaurant.averageCost <= request.budget) reasons.push("符合预算");
      }
      if (restaurant.businessStatus === "open") {
        score += 12;
        reasons.push("正在营业");
      }
      if (businessHoursOverlapMeal(restaurant.businessHours, request.mealPeriod)) {
        score += 8;
        reasons.push(`适合${request.mealPeriod}时段`);
      }
      const tasteMatch = matchTastePreferences(restaurant, request.tastePreferences);
      if (tasteMatch.score) {
        score += tasteMatch.score;
        reasons.push(...tasteMatch.reasons);
      }
      const customPreference = matchCustomPreference(
        restaurant,
        request.customRequirement
      );
      if (customPreference) {
        score += 14;
        reasons.push("符合补充偏好");
      }
      if (
        (request.partySize >= 4 || request.occasion === "聚餐") &&
        /火锅|烤肉|酒楼|宴会|餐厅/.test(restaurant.category)
      ) {
        score += 6;
        reasons.push("适合多人用餐");
      }
      if (request.occasion === "约会" && /西餐|咖啡|融合菜|私房菜/.test(restaurant.category)) {
        score += 6;
        reasons.push("适合约会");
      }

      return {
        ...restaurant,
        score: Math.round(score * 10) / 10,
        reasons: reasons.length ? reasons : ["距离和场景较匹配"],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function isEligible(restaurant, request) {
  if (!restaurant.name || !Number.isFinite(restaurant.latitude) || !Number.isFinite(restaurant.longitude)) {
    return false;
  }
  const overlapsMeal = businessHoursOverlapMeal(
    restaurant.businessHours,
    request.mealPeriod
  );
  if (overlapsMeal === false) return false;
  if (overlapsMeal === null && restaurant.businessStatus === "closed") return false;
  if (restaurant.distance > request.radius * 1.15) return false;
  if (
    request.mealPeriod !== "早餐" &&
    BREAKFAST_WORDS.test(`${restaurant.name}${restaurant.category}`)
  ) {
    return false;
  }
  if (request.occasion === "请客" && QUICK_MEAL_WORDS.test(restaurant.category)) return false;
  const customPreference = parseCustomPreference(request.customRequirement);
  if (
    customPreference.negative.some((rule) =>
      rule.restaurant.test(`${restaurant.name}${restaurant.category}`)
    )
  ) {
    return false;
  }
  if (
    restaurant.averageCost !== null &&
    restaurant.averageCost > request.budget * 1.35
  ) {
    return false;
  }
  return true;
}

function matchTastePreferences(restaurant, tastePreferences = []) {
  const text = `${restaurant.name}${restaurant.category}`;
  const reasons = [];
  let score = 0;
  if (
    tastePreferences.some((taste) => ["清淡", "少油"].includes(taste)) &&
    /轻食|素食|粤菜|江浙|汤|粥/.test(text)
  ) {
    score += 16;
    reasons.push("口味较清淡");
  }
  if (tastePreferences.includes("辣") && /川菜|湘菜|重庆|麻辣|火锅|串串/.test(text)) {
    score += 16;
    reasons.push("符合辣味偏好");
  }
  if (tastePreferences.includes("素食") && /素食|蔬食|斋菜|轻食/.test(text)) {
    score += 18;
    reasons.push("素食选择更匹配");
  }
  return { score, reasons };
}

function parseCustomPreference(value) {
  const text = String(value || "");
  const positive = [];
  const negative = [];
  for (const rule of CUSTOM_PREFERENCE_RULES) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const prefix = text.slice(Math.max(0, match.index - 6), match.index);
    const target = /(不吃|不要|不想吃|不喜欢|避开|忌|不能吃|别来)\s*$/.test(prefix)
      ? negative
      : positive;
    target.push(rule);
  }
  return { positive, negative };
}

function matchCustomPreference(restaurant, customRequirement) {
  const text = `${restaurant.name}${restaurant.category}`;
  return parseCustomPreference(customRequirement).positive.some((rule) =>
    rule.restaurant.test(text)
  );
}

export function createMockRestaurants(request) {
  const base = [
    {
      id: "mock-1",
      name: "胡记锅贴",
      address: `${request.locationLabel}附近`,
      distance: 420,
      category: "中餐厅;特色小吃",
      rating: 4.8,
      averageCost: 36,
      businessStatus: "open",
      businessHours: "10:30-21:30",
      phone: "",
      photos: [],
      longitude: request.longitude + 0.002,
      latitude: request.latitude + 0.001,
    },
    {
      id: "mock-2",
      name: "青禾小馆",
      address: `${request.locationLabel}东侧`,
      distance: 650,
      category: "中餐厅;江浙菜",
      rating: 4.7,
      averageCost: 72,
      businessStatus: "open",
      businessHours: "11:00-22:00",
      phone: "",
      photos: [],
      longitude: request.longitude - 0.003,
      latitude: request.latitude + 0.002,
    },
    {
      id: "mock-3",
      name: "潮汕牛肉粿条",
      address: `${request.locationLabel}西侧`,
      distance: 380,
      category: "中餐厅;潮汕菜",
      rating: 4.6,
      averageCost: 42,
      businessStatus: "open",
      businessHours: "10:00-23:00",
      phone: "",
      photos: [],
      longitude: request.longitude - 0.001,
      latitude: request.latitude - 0.002,
    },
    {
      id: "mock-4",
      name: "山野菌子火锅",
      address: `${request.locationLabel}北侧`,
      distance: 880,
      category: "中餐厅;火锅",
      rating: 4.9,
      averageCost: 118,
      businessStatus: "open",
      businessHours: "11:00-24:00",
      phone: "",
      photos: [],
      longitude: request.longitude + 0.004,
      latitude: request.latitude - 0.002,
    },
  ].map((restaurant) => ({
    ...restaurant,
    navigationUrl: buildNavigationUrl(
      restaurant,
      restaurant.longitude,
      restaurant.latitude
    ),
    source: "mock",
  }));

  return rankRestaurants(base, request);
}
