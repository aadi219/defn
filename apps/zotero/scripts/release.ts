/** Release metadata for the plugin: the packaged manifest and Zotero's `updates.json`. */

export const REPOSITORY = "https://github.com/aadi219/defn";

export interface Manifest {
  version?: string;
  applications: {
    zotero: {
      id: string;
      update_url?: string;
      strict_min_version?: string;
      strict_max_version?: string;
    };
  };
  [key: string]: unknown;
}

/** The manifest as packaged: the version comes from package.json, the one source for it. */
export function releaseManifest(manifest: Manifest, version: string): Manifest {
  return { ...manifest, version };
}

/** Where a release's `.xpi` is downloaded from: the asset of its GitHub release `v<version>`. */
export function xpiUrl(version: string): string {
  return `${REPOSITORY}/releases/download/v${version}/defn-${version}.xpi`;
}

/**
 * The update manifest Zotero fetches from `update_url` (Firefox's format), listing this release.
 * `sha256` is the hex digest of the `.xpi`.
 */
export function updatesJSON(manifest: Manifest, version: string, sha256: string): unknown {
  const { id, strict_min_version, strict_max_version } = manifest.applications.zotero;
  return {
    addons: {
      [id]: {
        updates: [
          {
            version,
            update_link: xpiUrl(version),
            update_hash: `sha256:${sha256}`,
            applications: { zotero: { strict_min_version, strict_max_version } },
          },
        ],
      },
    },
  };
}
