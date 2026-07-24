import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "dist");
if (!outputRoot.startsWith(`${projectRoot}\\`) && !outputRoot.startsWith(`${projectRoot}/`)) {
  throw new Error("部署输出目录越界");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, "lib"), { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  await cp(resolve(projectRoot, file), resolve(outputRoot, file));
}
for (const file of [
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

await build({
  entryPoints: [resolve(projectRoot, "sites-worker.js")],
  outfile: resolve(outputRoot, "_worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
});

console.log("Sites部署产物已生成：dist/");
