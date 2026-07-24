import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateSearchPlans,
  collectRestaurantCandidates,
  fetchAmapPhotoDetails,
  mergeRestaurantPhotos,
} from "../lib/amap-mcp.js";

const request = {
  latitude: 39.908823,
  longitude: 116.39747,
  locationLabel: "测试位置",
  mealPeriod: "早餐",
  occasion: "日常",
  partySize: 1,
  tastePreferences: [],
  customRequirement: "",
  budget: 50,
  radius: 1000,
};

test("候选不足时会扩大范围、补充关键词并去重", async () => {
  const calls = [];
  const result = await collectRestaurantCandidates(request, {
    queryPois: async (plan) => {
      calls.push(plan);
      if (plan.radius === 1000) {
        return [
          poi("p1", 0.001),
          poi("closed", 0.002, { business_status: "0" }),
        ];
      }
      if (plan.radius === 2000) {
        return [poi("p1", 0.001), poi("p2", 0.006), poi("p3", 0.008)];
      }
      return [
        poi("p4", 0.012),
        poi("p5", 0.016),
        poi("over-budget", 0.018, { cost: "120" }),
      ];
    },
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.radius), [1000, 2000, 3000]);
  assert.equal(result.search.expanded, true);
  assert.equal(result.search.usedRadius, 3000);
  assert.equal(result.restaurants.length, 5);
  assert.equal(new Set(result.restaurants.map((item) => item.id)).size, 5);
  assert.ok(result.restaurants.every((item) => item.businessStatus !== "closed"));
});

test("首轮已有五家时不会执行补充搜索", async () => {
  let calls = 0;
  const result = await collectRestaurantCandidates(request, {
    queryPois: async () => {
      calls += 1;
      return Array.from({ length: 5 }, (_, index) =>
        poi(`primary-${index}`, 0.001 + index * 0.001)
      );
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.search.expanded, false);
  assert.equal(result.search.attempts, 1);
  assert.equal(result.restaurants.length, 5);
});

test("三组高德搜索全部失败时返回查询错误", async () => {
  await assert.rejects(
    () =>
      collectRestaurantCandidates(request, {
        queryPois: async () => {
          throw new Error("高德暂时不可用");
        },
      }),
    /高德暂时不可用/
  );
});

test("搜索计划使用餐次对应关键词并限制最大范围", () => {
  const plans = buildCandidateSearchPlans({ ...request, radius: 4000 });
  assert.equal(plans.length, 3);
  assert.match(plans[0].keywords, /早餐/);
  assert.ok(plans.every((plan) => plan.radius <= 5000));
});

test("Web详情照片会与MCP首图合并并去重", () => {
  const result = mergeRestaurantPhotos(
    [{ id: "p1", name: "测试餐厅", photos: ["https://img.test/1.jpg"] }],
    [
      {
        id: "p1",
        photos: [
          { url: "https://img.test/1.jpg" },
          { url: "https://img.test/2.jpg" },
          { url: "https://img.test/3.jpg" },
        ],
      },
    ]
  );

  assert.deepEqual(result[0].photos, [
    "https://img.test/1.jpg",
    "https://img.test/2.jpg",
    "https://img.test/3.jpg",
  ]);
});

test("照片详情接口按POI ID批量查询", async () => {
  let requestedUrl;
  const result = await fetchAmapPhotoDetails(
    ["p1", "p2"],
    "test-key",
    async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          status: "1",
          pois: [{ id: "p1", photos: [{ url: "https://img.test/1.jpg" }] }],
        }),
      };
    }
  );

  assert.equal(requestedUrl.searchParams.get("id"), "p1|p2");
  assert.equal(requestedUrl.searchParams.get("show_fields"), "photos");
  assert.equal(result.length, 1);
});

function poi(id, longitudeDelta, overrides = {}) {
  return {
    id,
    name: `早餐店${id}`,
    location: `${request.longitude + longitudeDelta},${request.latitude}`,
    address: "测试地址",
    type: "餐饮服务;中餐厅;早餐店",
    rating: "4.5",
    cost: "30",
    business_status: "1",
    ...overrides,
  };
}
