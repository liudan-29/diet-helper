import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  buildSearchKeywords,
  buildSupplementalSearchKeywords,
  normalizePoi,
  rankRestaurants,
} from "./recommendations.js";

const TIMEOUT_MS = 8000;
export const TARGET_CANDIDATE_COUNT = 5;
export const MAX_CANDIDATE_COUNT = 8;

export async function searchAmapRestaurants(request, apiKey) {
  const client = new Client({
    name: "diet-helper-web",
    version: "0.1.0",
  });
  const endpoint = new URL("https://mcp.amap.com/mcp");
  endpoint.searchParams.set("key", apiKey);
  const transport = new StreamableHTTPClientTransport(endpoint);
  let completed = false;

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

    const detailTool = tools.find((tool) => tool.name === "maps_search_detail");
    const result = await collectRestaurantCandidates(request, {
      queryPois: async ({ keywords, radius }) => {
        const result = await withTimeout(
          client.callTool({
            name: aroundSearch.name,
            arguments: {
              keywords,
              location: `${request.longitude},${request.latitude}`,
              radius: toolArgument(
                aroundSearch.inputSchema,
                "radius",
                radius
              ),
            },
          }),
          TIMEOUT_MS
        );
        return findPois(extractPayload(result));
      },
      enrichPois: (pois) =>
        detailTool ? enrichPoiDetails(client, detailTool, pois) : pois,
    });
    completed = true;
    return result;
  } finally {
    // 高德会在成功批次后自行结束这条Streamable HTTP连接。
    // Windows下再次关闭会触发SDK的Connection closed或libuv重复关闭错误。
    if (!completed) await client.close().catch(() => {});
  }
}

export async function collectRestaurantCandidates(
  request,
  { queryPois, enrichPois = async (pois) => pois }
) {
  const plans = buildCandidateSearchPlans(request);
  const restaurantsById = new Map();
  const errors = [];
  let attempts = 0;
  let usedRadius = request.radius;

  async function runPlans(activePlans) {
    attempts += activePlans.length;
    const newPois = [];

    for (const plan of activePlans) {
      try {
        const pois = await queryPois(plan);
        for (const poi of pois || []) {
          const key = poiKey(poi);
          if (!key || restaurantsById.has(key)) continue;
          restaurantsById.set(key, null);
          newPois.push(poi);
        }
      } catch (error) {
        errors.push(error);
      }
    }

    const enrichedPois = await enrichPois(newPois);
    enrichedPois.forEach((poi) => {
      const key = poiKey(poi);
      if (key) restaurantsById.set(key, poi);
    });
  }

  await runPlans(plans.slice(0, 1));
  let restaurants = rankCollectedRestaurants(
    restaurantsById,
    request,
    usedRadius
  );

  if (restaurants.length < TARGET_CANDIDATE_COUNT) {
    const supplementalPlans = plans.slice(1);
    usedRadius = Math.max(...supplementalPlans.map((plan) => plan.radius));
    await runPlans(supplementalPlans);
    restaurants = rankCollectedRestaurants(
      restaurantsById,
      request,
      usedRadius
    );
  }

  if (!restaurantsById.size && errors.length === attempts) {
    throw errors[0];
  }

  return {
    restaurants: restaurants.slice(0, MAX_CANDIDATE_COUNT),
    search: {
      requestedRadius: request.radius,
      usedRadius,
      expanded: usedRadius > request.radius,
      attempts,
      targetCount: TARGET_CANDIDATE_COUNT,
    },
  };
}

export function buildCandidateSearchPlans(request) {
  const [secondaryKeywords, broadKeywords] =
    buildSupplementalSearchKeywords(request);
  return [
    {
      keywords: buildSearchKeywords(request),
      radius: request.radius,
    },
    {
      keywords: secondaryKeywords,
      radius: Math.max(
        request.radius,
        Math.min(5000, Math.max(2000, request.radius * 2))
      ),
    },
    {
      keywords: broadKeywords,
      radius: Math.max(
        request.radius,
        Math.min(5000, Math.max(3000, request.radius * 3))
      ),
    },
  ];
}

function rankCollectedRestaurants(restaurantsById, request, radius) {
  const pois = [...restaurantsById.values()].filter(Boolean);
  return rankRestaurants(
    pois.map((poi) => normalizePoi(poi, request)),
    { ...request, radius }
  );
}

function poiKey(poi) {
  const id = poi?.id || poi?.poiid;
  if (id) return `id:${id}`;
  const name = String(poi?.name || "").trim();
  const address = String(poi?.address || "").trim();
  return name ? `name:${name}|${address}` : "";
}

async function enrichPoiDetails(client, detailTool, pois) {
  const enrichedPois = [];
  for (const poi of pois.slice(0, 16)) {
    if (!poi.id && !poi.poiid) {
      enrichedPois.push(poi);
      continue;
    }
    try {
      const detailResult = await withTimeout(
        client.callTool({
          name: detailTool.name,
          arguments: { id: String(poi.id || poi.poiid) },
        }),
        TIMEOUT_MS
      );
      const detail = extractPayload(detailResult);
      enrichedPois.push(
        detail && typeof detail === "object"
          ? { ...poi, ...detail, photo: detail.photo || poi.photo }
          : poi
      );
    } catch {
      enrichedPois.push(poi);
    }
  }
  return enrichedPois;
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
