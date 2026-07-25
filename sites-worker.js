import { searchAmapRestaurants } from "./lib/amap-mcp.js";
import {
  createMockRestaurants,
  validateMealRequest,
} from "./lib/recommendations.js";

const STATIC_ASSETS =
  typeof __STATIC_ASSETS__ === "undefined" ? null : __STATIC_ASSETS__;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, mode: env.AMAP_MCP_KEY ? "amap" : "mock" });
    }
    if (url.pathname === "/api/recommendations" && request.method === "POST") {
      return recommendations(request, env);
    }
    if (url.pathname === "/api/geocode" && request.method === "POST") {
      return geocode(request, env);
    }
    return serveAsset(request, env);
  },
};

function serveAsset(request, env) {
  const url = new URL(request.url);
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const embedded = STATIC_ASSETS?.[path];
  if (embedded !== undefined) {
    const extension = path.split(".").pop();
    const types = {
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "text/javascript; charset=utf-8",
      json: "application/json; charset=utf-8",
    };
    return new Response(embedded, {
      headers: {
        "Content-Type": types[extension] || "application/octet-stream",
        "Cache-Control": extension === "html" ? "no-cache" : "public, max-age=3600",
      },
    });
  }
  if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
  return new Response("Not found", { status: 404 });
}

async function recommendations(request, env) {
  let input;
  try {
    input = validateMealRequest(await readJson(request));
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const apiKey = env.AMAP_MCP_KEY?.trim();
  try {
    const result = apiKey
      ? await searchAmapRestaurants(input, apiKey)
      : {
          restaurants: createMockRestaurants(input),
          search: {
            requestedRadius: input.radius,
            usedRadius: input.radius,
            expanded: false,
            attempts: 0,
            targetCount: 3,
          },
        };
    return json({ ...result, mode: apiKey ? "amap-mcp" : "mock" });
  } catch (error) {
    console.error("Amap query failed:", safeErrorMessage(error));
    return json({ error: publicQueryError(error) }, 502);
  }
}

async function geocode(request, env) {
  let input;
  try {
    input = await readJson(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const address = String(input.address || "").trim();
  if (!address || address.length > 120) {
    return json({ error: "地点请填写1至120个字符" }, 400);
  }
  const apiKey = env.AMAP_MCP_KEY?.trim();
  if (!apiKey) {
    return json({
      mode: "mock",
      formattedAddress: `${address} · 演示坐标`,
      longitude: 116.397428,
      latitude: 39.90923,
    });
  }
  try {
    const endpoint = new URL("https://restapi.amap.com/v3/geocode/geo");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("address", address);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    const first = payload.geocodes?.[0];
    const [longitude, latitude] = String(first?.location || "").split(",").map(Number);
    if (!response.ok || payload.status !== "1" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return json({ error: "没有找到这个地点，请补充城市或更具体的地址", retryable: true }, 404);
    }
    return json({
      mode: "amap",
      formattedAddress: first.formatted_address || address,
      longitude,
      latitude,
    });
  } catch (error) {
    console.error("Amap geocode failed:", safeErrorMessage(error));
    return json({
      error: error?.name === "TimeoutError" ? "地点解析超时" : "高德地点解析失败",
      retryable: true,
    }, 502);
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100_000) throw new Error("请求内容过大");
  const body = await request.text();
  if (body.length > 100_000) throw new Error("请求内容过大");
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("请求格式无效");
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeErrorMessage(error) {
  return String(error?.message || error || "unknown error")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b[a-f0-9]{32}\b/gi, "[redacted]");
}

function publicQueryError(error) {
  const message = safeErrorMessage(error);
  if (message.includes("超时")) return "高德MCP查询超时";
  if (message.includes("周边搜索工具")) return "高德MCP暂未提供周边搜索";
  return "高德MCP查询失败";
}
