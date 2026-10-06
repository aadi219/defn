import { describe, expect, it } from "vitest";
import { dataUrlToBytes } from "../src/crop";
import { toPdfRect } from "../src/readerBridge";

describe("dataUrlToBytes", () => {
  it("decodes the base64 payload", () => {
    expect(dataUrlToBytes("data:image/png;base64,AQID/w==", (s) => atob(s))).toEqual(
      new Uint8Array([1, 2, 3, 255]),
    );
  });
});

describe("toPdfRect", () => {
  it("normalizes Zotero position rects", () => {
    expect(toPdfRect([30, 40, 10, 20])).toEqual({ x1: 10, y1: 20, x2: 30, y2: 40 });
  });
});
