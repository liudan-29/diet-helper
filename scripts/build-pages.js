import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "_site");
const apiBase = normalizeApiBase(process.env.DIET_HELPER_API_BASE);

assertInsideProject(outputRoot);
await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, "lib"), { recursive: true });

for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "favicon.svg",
]) {
  await cp(resolve(projectRoot, file), resolve(outputRoot, file));
}

for (const file of [
  "api.js",
  "cooking-plans.js",
  "cooking-ui.js",
  "local-store.js",
  "photo-store.js",
  "profile-ui.js",
  "records-ui.js",
  "ui.js",
  "where-to-eat.js",
]) {
  await cp(resolve(projectRoot, "lib", file), resolve(outputRoot, "lib", file));
}

await writeFile(
  resolve(outputRoot, "config.js"),
  `globalThis.DIET_HELPER_CONFIG = Object.freeze(${JSON.stringify({ apiBase })});\n`,
  "utf8",
);
await writeFile(resolve(outputRoot, ".nojekyll"), "", "utf8");

console.log("GitHub Pages构建产物已生成：_site/");

function normalizeApiBase(value) {
  const input = String(value || "").trim();
  if (!input) {
    throw new Error("缺少DIET_HELPER_API_BASE，无法构建GitHub Pages产物");
  }
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("DIET_HELPER_API_BASE必须是合法的HTTPS地址");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("DIET_HELPER_API_BASE必须是合法的HTTPS地址");
  }
  return parsed.href.replace(/\/+$/, "");
}

function assertInsideProject(target) {
  const targetRelative = relative(projectRoot, target);
  if (
    !targetRelative ||
    targetRelative.startsWith("..") ||
    isAbsolute(targetRelative)
  ) {
    throw new Error("Pages输出目录越界");
  }
}
