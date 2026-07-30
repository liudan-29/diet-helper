import test from "node:test";
import assert from "node:assert/strict";

import { isAmapDataMode } from "../lib/where-to-eat.js";

test("MCP和Web兜底都标记为高德真实数据", () => {
  assert.equal(isAmapDataMode("amap-mcp"), true);
  assert.equal(isAmapDataMode("amap-web-fallback"), true);
  assert.equal(isAmapDataMode("mock"), false);
});
