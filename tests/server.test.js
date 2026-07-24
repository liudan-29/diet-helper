import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const TEST_PORT = 4199;

test("服务端健康检查和演示推荐接口可用", async (context) => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      AMAP_MCP_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  context.after(() => child.kill());
  await waitForServer(child);

  const healthResponse = await fetch(`http://localhost:${TEST_PORT}/api/health`);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.source, "mock");

  const recommendationResponse = await fetch(
    `http://localhost:${TEST_PORT}/api/recommendations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: 39.908823,
        longitude: 116.39747,
        locationLabel: "北京测试",
        mealPeriod: "午餐",
        occasion: "日常",
        partySize: 2,
        tastePreferences: ["清淡"],
        customRequirement: "",
        budget: 80,
        radius: 1000,
      }),
    }
  );
  const payload = await recommendationResponse.json();
  assert.equal(recommendationResponse.status, 200);
  assert.equal(payload.mode, "mock");
  assert.ok(payload.restaurants.length >= 3);
  assert.equal(payload.search.expanded, false);
  assert.equal(payload.search.usedRadius, 1000);
});

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("测试服务启动超时"));
    }, 5000);

    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("饮食小助手已启动")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      clearTimeout(timeout);
      reject(new Error(String(chunk)));
    });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`测试服务异常退出：${code}`));
      }
    });
  });
}
