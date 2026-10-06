/**
 * Builds the Zotero plugin: bundles src/index.ts into addon/content/deflink.js and packages
 * dist/deflink-<version>.xpi (PLAN.md §M9). Run with `pnpm --filter @deflink/zotero build`.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createZip, type ZipEntry } from "./zip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const addon = join(root, "addon");
const out = join(root, "dist");
const staging = join(out, "addon");

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return nested.flat().sort();
}

await rm(out, { recursive: true, force: true });
await mkdir(join(staging, "content"), { recursive: true });
for (const file of ["manifest.json", "bootstrap.js"]) {
  await writeFile(join(staging, file), await readFile(join(addon, file)));
}
await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(staging, "content/deflink.js"),
  bundle: true,
  format: "iife",
  globalName: "DefLink",
  target: "firefox128",
  platform: "browser",
  charset: "utf8",
  legalComments: "none",
});

const manifest = JSON.parse(await readFile(join(addon, "manifest.json"), "utf8")) as {
  version: string;
};
const entries: ZipEntry[] = await Promise.all(
  (await filesUnder(staging)).map(async (file) => ({
    path: relative(staging, file).split(sep).join("/"),
    data: new Uint8Array(await readFile(file)),
  })),
);
const xpi = join(out, `deflink-${manifest.version}.xpi`);
await writeFile(xpi, createZip(entries));
console.log(`Built ${relative(root, xpi)} (${entries.length} files)`);
