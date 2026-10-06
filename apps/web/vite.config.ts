import { createReadStream, existsSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, normalize, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];
const PDFJS_PREFIX = "/pdfjs/";

/**
 * Serves PDF.js runtime assets (cmaps, standard fonts, wasm decoders, ICC profiles) under
 * /pdfjs/ in dev and copies them into the build output.
 */
function pdfjsAssets(): Plugin {
  let outDir = "dist";
  return {
    name: "defn-pdfjs-assets",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith(PDFJS_PREFIX)) return next();
        const rel = normalize(decodeURIComponent(url.slice(PDFJS_PREFIX.length)));
        const file = join(PDFJS_ROOT, rel);
        const allowed = PDFJS_ASSET_DIRS.some((d) => file.startsWith(join(PDFJS_ROOT, d) + sep));
        if (!allowed || !existsSync(file) || !statSync(file).isFile()) return next();
        if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        createReadStream(file).pipe(res);
      });
    },
    async writeBundle() {
      for (const d of PDFJS_ASSET_DIRS) {
        await cp(join(PDFJS_ROOT, d), join(outDir, "pdfjs", d), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  server: { port: 5173, strictPort: true },
});
