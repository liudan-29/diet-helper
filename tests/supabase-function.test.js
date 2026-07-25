import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";

const FUNCTION_ORIGIN = "http://127.0.0.1:8000";
const ALLOWED_ORIGIN = "https://mealcompass-web.github.io";

test("Supabase Edge Function路由、CORS和请求边界可用", async (context) => {
  const denoArguments = [
    "--yes",
    "deno",
    "run",
    "--allow-net",
    "--allow-env",
    "--config=supabase/functions/diet-helper/deno.json",
    "supabase/functions/diet-helper/index.ts",
  ];
  const options = {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      AMAP_MCP_KEY: "",
      ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  };
  const child = process.platform === "win32"
    ? spawn(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", `npx.cmd ${denoArguments.join(" ")}`],
        options,
      )
    : spawn("npx", denoArguments, options);

  context.after(() => stopProcessTree(child));
  await waitForFunction(child);

  const health = await callFunction("health");
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  assert.deepEqual(await health.json(), { ok: true, mode: "mock" });

  const preflight = await callFunction("recommendations", {
    method: "OPTIONS",
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    ALLOWED_ORIGIN,
  );
  assert.match(
    preflight.headers.get("access-control-allow-methods") || "",
    /POST/,
  );

  const forbidden = await fetch(
    `${FUNCTION_ORIGIN}/functions/v1/diet-helper/health`,
    { headers: { Origin: "https://untrusted.example" } },
  );
  assert.equal(forbidden.status, 403);

  const recommendation = await callFunction("recommendations", {
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
  });
  assert.equal(recommendation.status, 200);
  const recommendationBody = await recommendation.json();
  assert.equal(recommendationBody.mode, "mock");
  assert.ok(recommendationBody.restaurants.length >= 3);

  const geocode = await callFunction("geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "北京故宫" }),
  });
  assert.equal(geocode.status, 200);
  const geocodeBody = await geocode.json();
  assert.equal(geocodeBody.mode, "mock");
  assert.equal(typeof geocodeBody.longitude, "number");
  assert.equal(typeof geocodeBody.latitude, "number");

  const invalidJson = await callFunction("geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(invalidJson.status, 400);

  const oversized = await callFunction("geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "a".repeat(100_001) }),
  });
  assert.equal(oversized.status, 413);
});

function callFunction(route, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", ALLOWED_ORIGIN);
  return fetch(
    `${FUNCTION_ORIGIN}/functions/v1/diet-helper/${route}`,
    { ...init, headers },
  );
}

async function waitForFunction(child) {
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Edge Function启动失败：${stderr}`);
    }
    try {
      const response = await fetch(
        `${FUNCTION_ORIGIN}/functions/v1/diet-helper/health`,
        { headers: { Origin: ALLOWED_ORIGIN } },
      );
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Edge Function启动超时：${stderr}`);
}

function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      child.kill();
    }
    return;
  }
  child.kill("SIGTERM");
}
