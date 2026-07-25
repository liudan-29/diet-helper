import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { apiFetch, apiUrl } from "../lib/api.js";

test("API地址在同源和Pages模式间切换", async () => {
  const originalConfig = globalThis.DIET_HELPER_CONFIG;
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.DIET_HELPER_CONFIG = { apiBase: "" };
    assert.equal(apiUrl("/api/geocode"), "/api/geocode");

    globalThis.DIET_HELPER_CONFIG = {
      apiBase: "https://example.supabase.co/functions/v1/diet-helper/",
    };
    assert.equal(
      apiUrl("/api/geocode"),
      "https://example.supabase.co/functions/v1/diet-helper/geocode",
    );
    assert.equal(
      apiUrl("api/recommendations"),
      "https://example.supabase.co/functions/v1/diet-helper/recommendations",
    );

    globalThis.fetch = async (...args) => {
      calls.push(args);
      return new Response("{}", { status: 200 });
    };
    await apiFetch("/api/health");
    assert.equal(
      calls[0][0],
      "https://example.supabase.co/functions/v1/diet-helper/health",
    );
  } finally {
    globalThis.DIET_HELPER_CONFIG = originalConfig;
    globalThis.fetch = originalFetch;
  }
});

test("Pages构建要求HTTPS API地址并生成完整静态产物", async () => {
  const missingBase = runBuild({});
  assert.notEqual(missingBase.status, 0);
  assert.match(
    `${missingBase.stdout}\n${missingBase.stderr}`,
    /DIET_HELPER_API_BASE/,
  );

  const apiBase =
    "https://diet-helper-test.supabase.co/functions/v1/diet-helper";
  const built = runBuild({ DIET_HELPER_API_BASE: `${apiBase}/` });
  assert.equal(built.status, 0, built.stderr);

  for (const path of [
    "_site/index.html",
    "_site/styles.css",
    "_site/app.js",
    "_site/config.js",
    "_site/favicon.svg",
    "_site/.nojekyll",
    "_site/lib/api.js",
    "_site/lib/where-to-eat.js",
    "_site/lib/profile-ui.js",
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
  }

  const config = await readFile(
    new URL("../_site/config.js", import.meta.url),
    "utf8",
  );
  assert.match(config, new RegExp(apiBase.replaceAll(".", "\\.")));
  assert.doesNotMatch(config, /\b[a-f0-9]{32}\b/i);
});

function runBuild(extraEnv) {
  return spawnSync(process.execPath, ["scripts/build-pages.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      DIET_HELPER_API_BASE: "",
      ...extraEnv,
    },
    encoding: "utf8",
  });
}
