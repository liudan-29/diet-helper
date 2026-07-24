import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  buildSearchKeywords,
  normalizePoi,
  rankRestaurants,
} from "./recommendations.js";

const TIMEOUT_MS = 8000;

export async function searchAmapRestaurants(request, apiKey) {
  const client = new Client({
    name: "diet-helper-web",
    version: "0.1.0",
  });
  const endpoint = new URL("https://mcp.amap.com/mcp");
  endpoint.searchParams.set("key", apiKey);
  const transport = new StreamableHTTPClientTransport(endpoint);

  try {
    await withTimeout(client.connect(transport), TIMEOUT_MS);
    const { tools } = await withTimeout(client.listTools(), TIMEOUT_MS);
    const aroundSearch = tools.find(
      (tool) =>
        tool.name === "maps_around_search" ||
        /around|nearby|周边/i.test(`${tool.name} ${tool.description || ""}`)
    );

    if (!aroundSearch) {
      throw new Error("高德MCP未提供周边搜索工具");
    }

    const result = await withTimeout(
      client.callTool({
        name: aroundSearch.name,
        arguments: {
          keywords: buildSearchKeywords(request),
          location: `${request.longitude},${request.latitude}`,
          radius: toolArgument(
            aroundSearch.inputSchema,
            "radius",
            request.radius
          ),
        },
      }),
      TIMEOUT_MS
    );

    const payload = extractPayload(result);
    const pois = findPois(payload);
    return rankRestaurants(
      pois.map((poi) => normalizePoi(poi, request)),
      request
    );
  } finally {
    await client.close().catch(() => {});
  }
}

function extractPayload(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = (result.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function findPois(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === "object" && "name" in item)) {
      return value;
    }
    for (const item of value) {
      const found = findPois(item);
      if (found.length) return found;
    }
  }
  if (typeof value === "object") {
    if (Array.isArray(value.pois)) return value.pois;
    for (const child of Object.values(value)) {
      const found = findPois(child);
      if (found.length) return found;
    }
  }
  return [];
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("高德MCP查询超时")),
      timeoutMs
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function toolArgument(inputSchema, name, value) {
  const type = inputSchema?.properties?.[name]?.type;
  return type === "string" ? String(value) : value;
}
