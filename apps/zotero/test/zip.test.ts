import { describe, expect, it } from "vitest";
import { crc32, createZip } from "../scripts/zip";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches known values", () => {
    expect(crc32(bytes(""))).toBe(0);
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });
});

describe("createZip", () => {
  it("writes stored entries with a central directory", () => {
    const zip = createZip([
      { path: "manifest.json", data: bytes("{}") },
      { path: "content/a.js", data: bytes("x") },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    // Second local header follows the first entry's 30-byte header, name and data.
    expect(view.getUint32(30 + "manifest.json".length + 2, true)).toBe(0x04034b50);
    expect(new TextDecoder().decode(zip.subarray(30, 30 + 13))).toBe("manifest.json");
  });
});
