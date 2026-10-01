import { describe, expect, it } from "vitest";
import {
  anchorAt,
  clampScale,
  computeLayout,
  fitWidthScale,
  offsetOf,
  PAGE_GAP,
  PAGE_PADDING,
  pageIndexAt,
  visibleRange,
} from "../layout";

const sizes = [
  { width: 600, height: 800 },
  { width: 600, height: 800 },
  { width: 800, height: 400 },
];

describe("layout", () => {
  it("stacks pages with padding and gaps", () => {
    const l = computeLayout(sizes, 0.5);
    expect(l.tops).toEqual([
      PAGE_PADDING,
      PAGE_PADDING + 400 + PAGE_GAP,
      PAGE_PADDING + 800 + 2 * PAGE_GAP,
    ]);
    expect(l.heights).toEqual([400, 400, 200]);
    expect(l.maxWidth).toBe(400);
    expect(l.totalHeight).toBe(PAGE_PADDING * 2 + 1000 + 2 * PAGE_GAP);
  });

  it("handles an empty document", () => {
    const l = computeLayout([], 1);
    expect(l.totalHeight).toBe(0);
    expect(visibleRange(l, 0, 500)).toEqual([0, -1]);
  });

  it("finds the page at an offset", () => {
    const l = computeLayout(sizes, 1);
    expect(pageIndexAt(l, 0)).toBe(0);
    expect(pageIndexAt(l, l.tops[1]! - 1)).toBe(0);
    expect(pageIndexAt(l, l.tops[1]!)).toBe(1);
    expect(pageIndexAt(l, 1e9)).toBe(2);
  });

  it("computes the visible range", () => {
    const l = computeLayout(sizes, 1);
    expect(visibleRange(l, 0, 500)).toEqual([0, 0]);
    expect(visibleRange(l, 700, 400)).toEqual([0, 1]);
    // Scrolled into the gap below page 1: page 1 is no longer visible.
    expect(visibleRange(l, l.tops[0]! + 800 + 1, 100)).toEqual([1, 1]);
    expect(visibleRange(l, 0, 1e6)).toEqual([0, 2]);
  });

  it("fits the widest page to the container", () => {
    expect(fitWidthScale(sizes, 800 + 2 * PAGE_PADDING)).toBe(1);
    expect(fitWidthScale(sizes, 10)).toBe(clampScale(0));
    expect(clampScale(100)).toBe(5);
  });

  it("round-trips scroll anchors across scales", () => {
    const a = computeLayout(sizes, 1);
    const b = computeLayout(sizes, 2);
    const y = a.tops[1]! + 200;
    const anchor = anchorAt(a, y);
    expect(anchor).toEqual({ index: 1, fraction: 0.25 });
    expect(offsetOf(b, anchor)).toBe(b.tops[1]! + 400);
  });
});
