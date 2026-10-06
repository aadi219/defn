import { describe, expect, it } from "vitest";
import { placePopover } from "../src/placement";

const viewport = { width: 1000, height: 800 };
const size = { width: 300, height: 200 };

describe("placePopover", () => {
  it("places below the anchor, aligned to its left edge", () => {
    expect(placePopover({ left: 100, top: 100, width: 50, height: 12 }, size, viewport)).toEqual({
      left: 100,
      top: 118,
    });
  });

  it("flips above when there is no room below", () => {
    expect(placePopover({ left: 100, top: 700, width: 50, height: 12 }, size, viewport)).toEqual({
      left: 100,
      top: 494,
    });
  });

  it("clamps to the viewport edges", () => {
    expect(placePopover({ left: 900, top: 100, width: 50, height: 12 }, size, viewport).left).toBe(
      692,
    );
    expect(placePopover({ left: -20, top: 100, width: 50, height: 12 }, size, viewport).left).toBe(
      8,
    );
  });
});
