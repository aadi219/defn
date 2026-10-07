/**
 * Builds the Zotero plugin: bundles src/index.ts into addon/content/defn.js, packages
 * dist/defn-<version>.xpi with the version from package.json (PLAN.md §M9), and writes
 * dist/updates.json for the GitHub release. Run with `pnpm --filter @defn/zotero build`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { releaseManifest, updatesJSON, type Manifest } from "./release";
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
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  version: string;
};
const manifest = releaseManifest(
  JSON.parse(await readFile(join(addon, "manifest.json"), "utf8")) as Manifest,
  version,
);
await writeFile(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(staging, "bootstrap.js"), await readFile(join(addon, "bootstrap.js")));
await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(staging, "content/defn.js"),
  bundle: true,
  format: "iife",
  globalName: "Defn",
  target: "firefox128",
  platform: "browser",
  charset: "utf8",
  legalComments: "none",
});

const entries: ZipEntry[] = await Promise.all(
  (await filesUnder(staging)).map(async (file) => ({
    path: relative(staging, file).split(sep).join("/"),
    data: new Uint8Array(await readFile(file)),
  })),
);
const xpi = join(out, `defn-${version}.xpi`);
const zip = createZip(entries);
await writeFile(xpi, zip);
const sha256 = createHash("sha256").update(zip).digest("hex");
const updates = join(out, "updates.json");
await writeFile(updates, `${JSON.stringify(updatesJSON(manifest, version, sha256), null, 2)}\n`);
console.log(
  `Built ${relative(root, xpi)} (${entries.length} files) and ${relative(root, updates)}`,
);
