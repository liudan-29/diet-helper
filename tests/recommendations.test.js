import test from "node:test";
import assert from "node:assert/strict";

import {
  businessHoursOverlapMeal,
  buildSearchKeywords,
  createMockRestaurants,
  normalizePoi,
  rankRestaurants,
  validateMealRequest,
} from "../lib/recommendations.js";

const request = {
  latitude: 39.908823,
  longitude: 116.39747,
  locationLabel: "测试位置",
  mealPeriod: "午餐",
  occasion: "日常",
  partySize: 1,
  tastePreferences: [],
  customRequirement: "",
  budget: 80,
  radius: 1000,
};

test("用餐需求会被标准化", () => {
  const result = validateMealRequest({
    ...request,
    latitude: String(request.latitude),
    budget: "80",
  });
  assert.equal(result.latitude, request.latitude);
  assert.equal(result.budget, 80);
  assert.equal(result.radius, 1000);
  assert.equal(result.partySize, 1);
  assert.deepEqual(result.tastePreferences, []);
});

test("人均预算可以从零元开始", () => {
  const result = validateMealRequest({ ...request, budget: 0 });
  assert.equal(result.budget, 0);
  assert.throws(
    () => validateMealRequest({ ...request, budget: -1 }),
    /预算无效/
  );
});

test("无效坐标会被拒绝", () => {
  assert.throws(
    () => validateMealRequest({ ...request, latitude: 190 }),
    /纬度无效/
  );
});

test("午餐会排除早餐专营店和已打烊餐厅", () => {
  const restaurants = [
    restaurant({ id: "breakfast", name: "老张油条铺", category: "餐饮;早餐" }),
    restaurant({ id: "closed", name: "今晚食堂", businessStatus: "closed" }),
    restaurant({ id: "lunch", name: "青禾小馆", businessHours: "11:00-22:00" }),
  ];

  const result = rankRestaurants(restaurants, request);
  assert.deepEqual(result.map((item) => item.id), ["lunch"]);
});

test("餐厅必须覆盖所选餐次，不能按当前是否营业代替", () => {
  const restaurants = [
    restaurant({
      id: "morning-only",
      name: "晨光食堂",
      businessHours: "06:00-10:30",
    }),
    restaurant({
      id: "opens-at-lunch",
      name: "午后小馆",
      businessStatus: "closed",
      businessHours: "11:00-22:00",
    }),
  ];

  const result = rankRestaurants(restaurants, request);
  assert.deepEqual(result.map((item) => item.id), ["opens-at-lunch"]);
  assert.equal(businessHoursOverlapMeal("06:00-10:30", "午餐"), false);
  assert.equal(businessHoursOverlapMeal("11:00-22:00", "午餐"), true);
  assert.equal(businessHoursOverlapMeal("", "午餐"), null);
});

test("跨午夜营业时间可以覆盖夜宵", () => {
  assert.equal(businessHoursOverlapMeal("18:00-02:00", "夜宵"), true);
  assert.equal(businessHoursOverlapMeal("06:00-18:00", "夜宵"), false);
});

test("请客场景会排除快餐并优先高评分餐厅", () => {
  const restaurants = [
    restaurant({ id: "fast", name: "快捷盒饭", category: "餐饮;快餐" }),
    restaurant({ id: "good", name: "山水小馆", rating: 4.8, distance: 500 }),
    restaurant({ id: "normal", name: "街角餐厅", rating: 4.2, distance: 600 }),
  ];

  const result = rankRestaurants(restaurants, { ...request, occasion: "请客" });
  assert.deepEqual(result.map((item) => item.id), ["good", "normal"]);
});

test("自定义场合、人数和口味偏好会被校验并保留", () => {
  const result = validateMealRequest({
    ...request,
    occasion: "其他",
    customOccasion: "看球",
    partySize: "4",
    tastePreferences: ["辣", "少油"],
    customRequirement: "不吃香菜",
  });

  assert.equal(result.occasion, "看球");
  assert.equal(result.occasionPreset, "其他");
  assert.equal(result.partySize, 4);
  assert.deepEqual(result.tastePreferences, ["辣", "少油"]);
  assert.equal(result.customRequirement, "不吃香菜");
  assert.match(buildSearchKeywords(result), /看球/);
});

test("可识别的自定义餐厅偏好会参与搜索和排除", () => {
  const customRequest = {
    ...request,
    customRequirement: "想吃面，不吃火锅",
  };
  const restaurants = [
    restaurant({ id: "noodle", name: "老街面馆", category: "餐饮;面馆" }),
    restaurant({ id: "hotpot", name: "山城火锅", category: "餐饮;火锅" }),
  ];

  assert.match(buildSearchKeywords(customRequest), /面馆/);
  assert.deepEqual(
    rankRestaurants(restaurants, customRequest).map((item) => item.id),
    ["noodle"]
  );
});

test("没有高德Key时仍能生成可导航的演示推荐", () => {
  const result = createMockRestaurants(validateMealRequest(request));
  assert.ok(result.length >= 3);
  assert.match(result[0].navigationUrl, /^https:\/\/uri\.amap\.com\/navigation/);
});

test("高德详情字段会转换成餐厅快照并计算距离", () => {
  const result = normalizePoi(
    {
      id: "amap-1",
      name: "测试餐厅",
      location: "116.402873,39.914525",
      address: "测试地址",
      type: "餐饮服务;中餐厅;北京菜",
      photo: "https://example.com/photo.jpg",
      cost: "68.00",
      rating: "4.8",
      open_time: "00:00-23:59",
    },
    request
  );

  assert.equal(result.averageCost, 68);
  assert.equal(result.rating, 4.8);
  assert.equal(result.photos.length, 1);
  assert.ok(result.distance > 0);
  assert.equal(result.businessStatus, "open");
});

function restaurant(overrides = {}) {
  return {
    id: "restaurant",
    name: "测试餐厅",
    address: "测试地址",
    longitude: 116.4,
    latitude: 39.9,
    distance: 400,
    category: "餐饮;中餐厅",
    rating: 4.5,
    averageCost: 60,
    businessStatus: "open",
    businessHours: "",
    navigationUrl: "https://example.com",
    ...overrides,
  };
}
