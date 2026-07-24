import test from "node:test";
import assert from "node:assert/strict";

import {
  createMockRestaurants,
  rankRestaurants,
  validateMealRequest,
} from "../lib/recommendations.js";

const request = {
  latitude: 39.908823,
  longitude: 116.39747,
  locationLabel: "测试位置",
  mealPeriod: "午餐",
  scene: "日常",
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
    restaurant({ id: "lunch", name: "青禾小馆" }),
  ];

  const result = rankRestaurants(restaurants, request);
  assert.deepEqual(result.map((item) => item.id), ["lunch"]);
});

test("请客场景会排除快餐并优先高评分餐厅", () => {
  const restaurants = [
    restaurant({ id: "fast", name: "快捷盒饭", category: "餐饮;快餐" }),
    restaurant({ id: "good", name: "山水小馆", rating: 4.8, distance: 500 }),
    restaurant({ id: "normal", name: "街角餐厅", rating: 4.2, distance: 600 }),
  ];

  const result = rankRestaurants(restaurants, { ...request, scene: "请客" });
  assert.deepEqual(result.map((item) => item.id), ["good", "normal"]);
});

test("没有高德Key时仍能生成可导航的演示推荐", () => {
  const result = createMockRestaurants(validateMealRequest(request));
  assert.ok(result.length >= 3);
  assert.match(result[0].navigationUrl, /^https:\/\/uri\.amap\.com\/navigation/);
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
    navigationUrl: "https://example.com",
    ...overrides,
  };
}
