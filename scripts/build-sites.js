import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "dist");
if (!outputRoot.startsWith(`${projectRoot}\\`) && !outputRoot.startsWith(`${projectRoot}/`)) {
  throw new Error("部署输出目录越界");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, "server"), { recursive: true });
await mkdir(resolve(outputRoot, ".openai"), { recursive: true });

const clientFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "api.js",
  "cooking-plans.js",
  "cooking-ui.js",
  "local-store.js",
  "photo-store.js",
  "profile-ui.js",
  "records-ui.js",
  "ui.js",
  "where-to-eat.js",
];
const staticAssets = {};
for (const file of clientFiles) {
  const sourcePath = ["index.html", "styles.css", "app.js", "config.js"].includes(file)
    ? resolve(projectRoot, file)
    : resolve(projectRoot, "lib", file);
  const publicPath = ["index.html", "styles.css", "app.js", "config.js"].includes(file)
    ? `/${file}`
    : `/lib/${file}`;
  staticAssets[publicPath] = await readFile(sourcePath, "utf8");
}

await build({
  entryPoints: [resolve(projectRoot, "sites-worker.js")],
  outfile: resolve(outputRoot, "server", "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  define: {
    __STATIC_ASSETS__: JSON.stringify(staticAssets),
  },
});
await cp(
  resolve(projectRoot, ".openai", "hosting.json"),
  resolve(outputRoot, ".openai", "hosting.json")
);

console.log("Sites部署产物已生成：dist/");
