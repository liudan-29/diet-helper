import "dotenv/config";

import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { searchAmapRestaurants } from "./lib/amap-mcp.js";
import {
  createMockRestaurants,
  validateMealRequest,
} from "./lib/recommendations.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/recommendations") {
      return await handleRecommendations(request, response);
    }
    if (request.method === "POST" && request.url === "/api/geocode") {
      return await handleGeocode(request, response);
    }
    if (request.method === "GET" && request.url === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        source: process.env.AMAP_MCP_KEY ? "amap-mcp" : "mock",
      });
    }
    if (request.method === "GET") return serveStatic(request, response);
    sendJson(response, 405, { error: "不支持的请求方法" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "服务器暂时无法处理请求" });
  }
});

async function handleRecommendations(request, response) {
  let input;
  try {
    input = validateMealRequest(await readJson(request));
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }

  const apiKey = process.env.AMAP_MCP_KEY?.trim();
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

    sendJson(response, 200, {
      mode: apiKey ? "amap-mcp" : "mock",
      request: input,
      restaurants: result.restaurants,
      count: result.restaurants.length,
      search: result.search,
    });
  } catch (error) {
    console.error("Recommendation query failed:", safeErrorMessage(error));
    sendJson(response, 502, {
      error: publicQueryError(error),
      retryable: true,
    });
  }
}

async function handleGeocode(request, response) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }
  const address = String(body.address || "").trim();
  if (!address || address.length > 80) {
    return sendJson(response, 400, { error: "地点名称应为1至80个字符" });
  }

  const apiKey = process.env.AMAP_MCP_KEY?.trim();
  if (!apiKey) {
    return sendJson(response, 200, {
      mode: "mock",
      formattedAddress: `${address} · 演示坐标`,
      longitude: 116.39747,
      latitude: 39.908823,
    });
  }

  try {
    const endpoint = new URL("https://restapi.amap.com/v3/geocode/geo");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("address", address);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let geocodeResponse;
    try {
      geocodeResponse = await fetch(endpoint, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!geocodeResponse.ok) throw new Error("高德地点解析请求失败");
    const payload = await geocodeResponse.json();
    const geocode = Array.isArray(payload.geocodes) ? payload.geocodes[0] : null;
    const [longitude, latitude] = String(geocode?.location || "")
      .split(",")
      .map(Number);
    if (
      String(payload.status) !== "1" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      return sendJson(response, 404, {
        error: "没有找到这个地点，请补充城市或更具体的地址",
        retryable: true,
      });
    }
    return sendJson(response, 200, {
      mode: "amap",
      formattedAddress: String(geocode.formatted_address || address),
      longitude,
      latitude,
    });
  } catch (error) {
    console.error("Geocode failed:", safeErrorMessage(error));
    return sendJson(response, 502, {
      error: error?.name === "AbortError" ? "地点解析超时" : "高德地点解析失败",
      retryable: true,
    });
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > 100_000) {
        body = "";
        fail(new Error("请求内容过大"));
      }
    });
    request.on("end", () => {
      if (settled) return;
      try {
        const parsed = JSON.parse(body || "{}");
        settled = true;
        resolve(parsed);
      } catch {
        fail(new Error("请求格式无效"));
      }
    });
    request.on("error", fail);
  });
}

function serveStatic(request, response) {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const safePath = normalize(relativePath);
  if (safePath.startsWith("..") || safePath.includes(":")) {
    return sendJson(response, 403, { error: "禁止访问" });
  }

  const filePath = join(projectRoot, safePath);
  if (!existsSync(filePath)) return sendJson(response, 404, { error: "页面不存在" });

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
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

server.listen(port, () => {
  console.log(`饮食小助手已启动：http://localhost:${port}`);
  console.log(`餐厅数据：${process.env.AMAP_MCP_KEY ? "高德MCP" : "演示数据"}`);
});
