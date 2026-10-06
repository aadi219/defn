import { describe, expect, it } from "vitest";
import {
  joinItems,
  pageHasText,
  rawOffsetToDom,
  type ItemGeometry,
  type Segment,
} from "../src/pageText";

/** An item on baseline y, starting at x, 10 units tall, 5 units per character. */
function item(str: string, x: number, y: number, hasEOL = false): ItemGeometry {
  return { str, x, y, width: str.length * 5, fontHeight: 10, hasEOL };
}

describe("joinItems", () => {
  it("joins adjacent items without a separator", () => {
    const { raw, ranges } = joinItems([item("com", 0, 100), item("pact", 15, 100)]);
    expect(raw).toBe("compact");
    expect(ranges).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 7 },
    ]);
  });

  it("inserts a space for a horizontal gap over a quarter of the font height", () => {
    expect(joinItems([item("a", 0, 100), item("b", 5 + 2, 100)]).raw).toBe("ab");
    expect(joinItems([item("a", 0, 100), item("b", 5 + 3, 100)]).raw).toBe("a b");
  });

  it("inserts a newline on a baseline change over half the font height", () => {
    expect(joinItems([item("a", 0, 100), item("b", 5, 96)]).raw).toBe("ab"); // e.g. a subscript
    expect(joinItems([item("a", 0, 100), item("b", 0, 88)]).raw).toBe("a\nb");
  });

  it("inserts a newline after an end-of-line item", () => {
    const { raw, ranges } = joinItems([item("com-", 0, 100, true), item("pact", 0, 100)]);
    expect(raw).toBe("com-\npact");
    expect(ranges[1]).toEqual({ start: 5, end: 9 });
  });

  it("carries an end-of-line flag on an empty item to the next separator", () => {
    const { raw, ranges } = joinItems([
      item("a", 0, 100),
      item("", 5, 100, true),
      item("b", 5, 100),
    ]);
    expect(raw).toBe("a\nb");
    expect(ranges).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 1 },
      { start: 2, end: 3 },
    ]);
  });

  it("returns an empty string for no items", () => {
    expect(joinItems([])).toEqual({ raw: "", ranges: [] });
  });
});

describe("rawOffsetToDom", () => {
  // Fake text nodes: rawOffsetToDom only passes them through.
  const a = { id: "a" } as unknown as Text;
  const b = { id: "b" } as unknown as Text;
  const segments: Segment[] = [
    { node: a, start: 0, end: 4 }, // "com-"
    { node: b, start: 5, end: 9 }, // "pact" after "\n"
  ];

  it("maps offsets inside segments", () => {
    expect(rawOffsetToDom({ segments }, 0)).toEqual({ node: a, offset: 0 });
    expect(rawOffsetToDom({ segments }, 3)).toEqual({ node: a, offset: 3 });
    expect(rawOffsetToDom({ segments }, 6)).toEqual({ node: b, offset: 1 });
    expect(rawOffsetToDom({ segments }, 9)).toEqual({ node: b, offset: 4 });
  });

  it("maps a segment end to the end of that segment", () => {
    expect(rawOffsetToDom({ segments }, 4)).toEqual({ node: a, offset: 4 });
  });

  it("snaps a separator offset to the end of the previous segment", () => {
    const withGap: Segment[] = [
      { node: a, start: 0, end: 4 },
      { node: b, start: 6, end: 9 },
    ];
    expect(rawOffsetToDom({ segments: withGap }, 5)).toEqual({ node: a, offset: 4 });
  });

  it("clamps offsets outside the text", () => {
    const late: Segment[] = [{ node: b, start: 3, end: 5 }];
    expect(rawOffsetToDom({ segments: late }, 0)).toEqual({ node: b, offset: 0 });
    expect(rawOffsetToDom({ segments: late }, 99)).toEqual({ node: b, offset: 2 });
  });

  it("returns null without segments", () => {
    expect(rawOffsetToDom({ segments: [] }, 0)).toBeNull();
  });
});

describe("pageHasText", () => {
  it("requires more than 20 characters after trimming", () => {
    expect(pageHasText("   ")).toBe(false);
    expect(pageHasText(` ${"x".repeat(20)} `)).toBe(false);
    expect(pageHasText("x".repeat(21))).toBe(true);
  });
});
