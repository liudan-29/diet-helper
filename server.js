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
    const restaurants = apiKey
      ? await searchAmapRestaurants(input, apiKey)
      : createMockRestaurants(input);

    sendJson(response, 200, {
      mode: apiKey ? "amap-mcp" : "mock",
      request: input,
      restaurants,
      count: restaurants.length,
    });
  } catch (error) {
    console.error("Recommendation query failed:", error);
    sendJson(response, 502, {
      error: error.message || "高德MCP查询失败",
      retryable: true,
    });
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("请求格式无效"));
      }
    });
    request.on("error", reject);
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

server.listen(port, () => {
  console.log(`饮食小助手已启动：http://localhost:${port}`);
  console.log(`餐厅数据：${process.env.AMAP_MCP_KEY ? "高德MCP" : "演示数据"}`);
});
