const BREAKFAST_WORDS = /早餐|油条|包子|豆浆|粥|煎饼|肠粉/;
const QUICK_MEAL_WORDS = /快餐|小吃|美食城|档口|汉堡|炸鸡/;

export const DEFAULT_RADIUS = 1000;

export function validateMealRequest(input) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const budget = Number(input.budget);
  const radius = Number(input.radius ?? DEFAULT_RADIUS);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("纬度无效");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("经度无效");
  }
  if (!["早餐", "午餐", "晚餐", "夜宵"].includes(input.mealPeriod)) {
    throw new Error("餐次无效");
  }
  if (!input.scene || typeof input.scene !== "string") {
    throw new Error("用餐场景无效");
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
    scene: input.scene,
    budget,
    radius,
    locationLabel: String(input.locationLabel || "当前位置").slice(0, 80),
  };
}

export function buildSearchKeywords(request) {
  if (request.mealPeriod === "早餐") return "早餐|包子|粥|面包";
  if (request.mealPeriod === "夜宵") return "夜宵|烧烤|火锅|小龙虾";
  if (request.scene === "想吃清淡") return "轻食|粤菜|江浙菜|素食";
  if (request.scene === "请客") return "中餐厅|私房菜|特色餐厅";
  return "餐厅|中餐|面馆|小吃";
}

export function normalizePoi(poi, request) {
  const location = String(poi.location || poi.location_string || "").split(",");
  const longitude = Number(location[0]);
  const latitude = Number(location[1]);
  const business = poi.business || poi.biz_ext || {};
  const photos = Array.isArray(poi.photos)
    ? poi.photos.map((photo) => photo.url || photo).filter(Boolean)
    : [];

  return {
    id: String(poi.id || poi.poiid || `${poi.name}-${poi.location}`),
    name: String(poi.name || "").trim(),
    address: String(poi.address || poi.pname || "地址暂缺"),
    longitude,
    latitude,
    distance: Number(poi.distance ?? 0),
    category: String(poi.type || poi.typecode || "餐饮"),
    rating: numberOrNull(business.rating ?? poi.rating),
    averageCost: numberOrNull(business.cost ?? poi.cost ?? poi.average_cost),
    businessStatus: normalizeBusinessStatus(
      business.business_status ?? poi.business_status ?? poi.status
    ),
    businessHours: business.opentime_today || business.opentime_week || poi.opentime || "",
    phone: String(poi.tel || ""),
    photos,
    navigationUrl: buildNavigationUrl(poi, longitude, latitude),
    source: "amap",
    requestLocation: request.locationLabel,
  };
}

function numberOrNull(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
      if (request.scene === "想吃清淡" && /轻食|素食|粤菜|江浙/.test(restaurant.category)) {
        score += 16;
        reasons.push("口味较清淡");
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
  if (restaurant.businessStatus === "closed") return false;
  if (restaurant.distance > request.radius * 1.15) return false;
  if (
    request.mealPeriod !== "早餐" &&
    BREAKFAST_WORDS.test(`${restaurant.name}${restaurant.category}`)
  ) {
    return false;
  }
  if (request.scene === "请客" && QUICK_MEAL_WORDS.test(restaurant.category)) return false;
  if (
    restaurant.averageCost !== null &&
    restaurant.averageCost > request.budget * 1.35
  ) {
    return false;
  }
  return true;
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
