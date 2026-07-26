import {
  searchAmapRestaurants,
  searchAmapWebRestaurants,
} from "../../../lib/amap-mcp.js";
import {
  createMockRestaurants,
  validateMealRequest,
} from "../../../lib/recommendations.js";

const MAX_BODY_BYTES = 100_000;
const GEOCODE_TIMEOUT_MS = 8_000;
const MCP_PRIMARY_TIMEOUT_MS = 6_500;
const WEB_FALLBACK_TIMEOUT_MS = 15_000;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://mealcompass-web.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return json({ error: "禁止访问" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  const route = routePath(new URL(request.url).pathname);
  let response: Response;

  if (route === "/health" && request.method === "GET") {
    response = json({
      ok: true,
      mode: Deno.env.get("AMAP_MCP_KEY")?.trim() ? "amap" : "mock",
    });
  } else if (route === "/recommendations" && request.method === "POST") {
    response = await recommendations(request);
  } else if (route === "/geocode" && request.method === "POST") {
    response = await geocode(request);
  } else if (["/health", "/recommendations", "/geocode"].includes(route)) {
    response = json({ error: "不支持的请求方法" }, 405);
  } else {
    response = json({ error: "接口不存在" }, 404);
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

async function recommendations(request: Request): Promise<Response> {
  let input;
  try {
    input = validateMealRequest(await readJson(request));
  } catch (error) {
    return requestErrorResponse(error);
  }

  const apiKey = Deno.env.get("AMAP_MCP_KEY")?.trim();
  try {
    const { result, mode } = apiKey
      ? await searchRealRestaurants(input, apiKey)
      : {
          result: {
            restaurants: createMockRestaurants(input),
            search: {
              requestedRadius: input.radius,
              usedRadius: input.radius,
              expanded: false,
              attempts: 0,
              targetCount: 3,
            },
          },
          mode: "mock",
        };
    return json({
      mode,
      request: input,
      restaurants: result.restaurants,
      count: result.restaurants.length,
      search: result.search,
    });
  } catch (error) {
    console.error("Recommendation query failed:", safeErrorMessage(error));
    return json({
      error: publicQueryError(error),
      retryable: true,
    }, 502);
  }
}

async function searchRealRestaurants(input: unknown, apiKey: string) {
  try {
    return {
      result: await withTimeout(
        searchAmapRestaurants(input, apiKey),
        MCP_PRIMARY_TIMEOUT_MS,
        "高德MCP查询超时",
      ),
      mode: "amap-mcp",
    };
  } catch (mcpError) {
    console.warn(
      "Amap MCP unavailable, using Web API fallback:",
      safeErrorMessage(mcpError),
    );
    return {
      result: await withTimeout(
        searchAmapWebRestaurants(input, apiKey),
        WEB_FALLBACK_TIMEOUT_MS,
        "高德Web服务查询超时",
      ),
      mode: "amap-web-fallback",
    };
  }
}

async function geocode(request: Request): Promise<Response> {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return requestErrorResponse(error);
  }

  const address = String(body.address || "").trim();
  if (!address || address.length > 80) {
    return json({ error: "地点名称应为1至80个字符" }, 400);
  }

  const apiKey = Deno.env.get("AMAP_MCP_KEY")?.trim();
  if (!apiKey) {
    return json({
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
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("高德地点解析请求失败");
    const payload = await response.json();
    const geocodeResult = Array.isArray(payload.geocodes)
      ? payload.geocodes[0]
      : null;
    const [longitude, latitude] = String(geocodeResult?.location || "")
      .split(",")
      .map(Number);
    if (
      String(payload.status) !== "1" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      return json({
        error: "没有找到这个地点，请补充城市或更具体的地址",
        retryable: true,
      }, 404);
    }
    return json({
      mode: "amap",
      formattedAddress: String(geocodeResult.formatted_address || address),
      longitude,
      latitude,
    });
  } catch (error) {
    console.error("Geocode failed:", safeErrorMessage(error));
    return json({
      error: isTimeoutError(error) ? "地点解析超时" : "高德地点解析失败",
      retryable: true,
    }, 502);
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new RequestError(413, "请求内容过大");
  }

  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let body = "";
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RequestError(413, "请求内容过大");
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();

  try {
    const parsed = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new RequestError(400, "请求格式无效");
  }
}

function requestErrorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return json({ error: error.message }, error.status);
  }
  return json({ error: safeValidationMessage(error) }, 400);
}

function safeValidationMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const allowedMessages = new Set([
    "纬度无效",
    "经度无效",
    "餐次无效",
    "用餐场景无效",
    "用餐场景过长",
    "请填写自定义用餐场景",
    "同行人数无效",
    "口味偏好无效",
    "其他要求过长",
    "预算无效",
    "搜索范围无效",
  ]);
  return allowedMessages.has(message) ? message : "请求参数无效";
}

function routePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const functionIndex = segments.lastIndexOf("diet-helper");
  const routeSegments = functionIndex >= 0
    ? segments.slice(functionIndex + 1)
    : segments;
  if (routeSegments[0] === "api") routeSegments.shift();
  return `/${routeSegments.join("/")}`;
}

function allowedOrigins(): Set<string> {
  const configured = String(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : String(error || "unknown error");
  return message
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b[a-f0-9]{32}\b/gi, "[redacted]");
}

function publicQueryError(error: unknown): string {
  const message = safeErrorMessage(error);
  if (message.includes("超时")) return "高德MCP查询超时";
  if (message.includes("周边搜索工具")) return "高德MCP暂未提供周边搜索";
  return "高德MCP查询失败";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error &&
    ["AbortError", "TimeoutError"].includes(error.name);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
