import "dotenv/config";

import { searchAmapRestaurants } from "../lib/amap-mcp.js";

if (!process.env.AMAP_MCP_KEY) {
  console.error("未配置AMAP_MCP_KEY");
  process.exit(1);
}

const request = {
  latitude: 39.908823,
  longitude: 116.39747,
  locationLabel: "北京测试",
  mealPeriod: "午餐",
  scene: "日常",
  budget: 80,
  radius: 1000,
};

try {
  const restaurants = await searchAmapRestaurants(
    request,
    process.env.AMAP_MCP_KEY
  );
  console.log(
    JSON.stringify({
      ok: true,
      count: restaurants.length,
      first: restaurants[0]?.name ?? null,
    })
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: String(error?.message || "").includes("超时")
        ? "timeout"
        : "connection_failed",
    })
  );
  process.exit(1);
}
