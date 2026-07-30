import test from "node:test";
import assert from "node:assert/strict";

import worker from "../sites-worker.js";

const env = {
  ASSETS: {
    fetch() {
      return new Response("asset", { status: 200 });
    },
  },
};

test("边缘入口健康检查和静态资源回退可用", async () => {
  const health = await worker.fetch(new Request("https://example.com/api/health"), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, mode: "mock" });

  const asset = await worker.fetch(new Request("https://example.com/styles.css"), env);
  assert.equal(await asset.text(), "asset");
});

test("边缘入口没有资源绑定时返回404", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/missing.txt"),
    {}
  );
  assert.equal(response.status, 404);
});

test("边缘入口无Key时返回演示推荐", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: 39.90923,
        longitude: 116.397428,
        locationLabel: "测试地点",
        mealPeriod: "午餐",
        occasion: "日常",
        partySize: 1,
        tastePreferences: [],
        customRequirement: "",
        budget: 80,
        radius: 1000,
      }),
    }),
    env
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, "mock");
  assert.ok(payload.restaurants.length >= 1);
});

test("边缘入口地点解析与前端使用同一响应契约", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "北京故宫" }),
    }),
    env
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, "mock");
  assert.equal(payload.formattedAddress, "北京故宫 · 演示坐标");
  assert.equal(typeof payload.longitude, "number");
  assert.equal(typeof payload.latitude, "number");
  assert.equal("location" in payload, false);
});
