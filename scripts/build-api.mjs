import * as esbuild from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "api");
const outfile = resolve(outDir, "[[...path]].js");

mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, "src/vercel-handler.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  outfile,
  format: "esm",
  // Keep mongodb (and all npm deps) out of the bundle — the driver uses
  // dynamic require() for Node built-ins like "timers", which breaks in ESM bundles.
  packages: "external",
  alias: {
    "@": resolve(root, "src"),
  },
  logLevel: "info",
});

console.log(`Bundled API → ${outfile}`);
