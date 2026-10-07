import { describe, expect, it } from "vitest";
import { releaseManifest, updatesJSON, xpiUrl, type Manifest } from "../scripts/release";

const manifest: Manifest = {
  manifest_version: 2,
  name: "Defn",
  applications: {
    zotero: {
      id: "defn@aadi219.github.io",
      update_url: "https://github.com/aadi219/defn/releases/latest/download/updates.json",
      strict_min_version: "8.0",
      strict_max_version: "9.0.*",
    },
  },
};

describe("release metadata", () => {
  it("stamps the package version into the manifest", () => {
    expect(releaseManifest(manifest, "0.1.0")).toEqual({ ...manifest, version: "0.1.0" });
  });

  it("lists the release's .xpi, hash and Zotero range in updates.json", () => {
    expect(updatesJSON(manifest, "0.1.0", "ab12")).toEqual({
      addons: {
        "defn@aadi219.github.io": {
          updates: [
            {
              version: "0.1.0",
              update_link:
                "https://github.com/aadi219/defn/releases/download/v0.1.0/defn-0.1.0.xpi",
              update_hash: "sha256:ab12",
              applications: { zotero: { strict_min_version: "8.0", strict_max_version: "9.0.*" } },
            },
          ],
        },
      },
    });
    expect(xpiUrl("0.1.0")).toMatch(/\/v0\.1\.0\/defn-0\.1\.0\.xpi$/);
  });
});
