import { describe, expect, it } from "vitest";
import {
  cssRectToPdf,
  mergeLineRects,
  padAndClamp,
  pdfRectToCss,
  unionPdfRects,
  type PointConverter,
} from "../src/coords";

/** Unrotated viewport of a 600x800 pt page at scale 2: x' = 2x, y' = 2(800 - y). */
const viewport: PointConverter = {
  convertToViewportPoint: (x, y) => [2 * x, 2 * (800 - y)],
  convertToPdfPoint: (x, y) => [x / 2, 800 - y / 2],
};

/** 90-degree rotation of the same page: x' = 2y, y' = 2x. */
const rotated: PointConverter = {
  convertToViewportPoint: (x, y) => [2 * y, 2 * x],
  convertToPdfPoint: (x, y) => [y / 2, x / 2],
};

const r = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe("PDF <-> CSS rect conversion", () => {
  it("flips y and scales", () => {
    expect(cssRectToPdf(r(100, 200, 50, 20), viewport)).toEqual({
      x1: 50,
      y1: 690,
      x2: 75,
      y2: 700,
    });
    expect(pdfRectToCss({ x1: 50, y1: 690, x2: 75, y2: 700 }, viewport)).toEqual(
      r(100, 200, 50, 20),
    );
  });

  it("round-trips through a rotated viewport", () => {
    const css = r(10, 20, 30, 40);
    const pdf = cssRectToPdf(css, rotated);
    expect(pdf.x1).toBeLessThanOrEqual(pdf.x2);
    expect(pdf.y1).toBeLessThanOrEqual(pdf.y2);
    expect(pdfRectToCss(pdf, rotated)).toEqual(css);
  });
});

describe("mergeLineRects", () => {
  it("merges rects on the same line and drops empty ones", () => {
    const merged = mergeLineRects([
      r(50, 101, 30, 10),
      r(10, 100, 20, 12),
      r(0, 0, 0, 10),
      r(10, 120, 40, 10),
    ]);
    expect(merged).toEqual([r(10, 100, 70, 12), r(10, 120, 40, 10)]);
  });

  it("keeps lines more than 2 px apart separate", () => {
    expect(mergeLineRects([r(0, 100, 10, 10), r(0, 103, 10, 10)])).toHaveLength(2);
  });
});

describe("unionPdfRects / padAndClamp", () => {
  it("unions rects", () => {
    expect(unionPdfRects([])).toBeNull();
    expect(
      unionPdfRects([
        { x1: 10, y1: 20, x2: 30, y2: 40 },
        { x1: 5, y1: 25, x2: 20, y2: 50 },
      ]),
    ).toEqual({ x1: 5, y1: 20, x2: 30, y2: 50 });
  });

  it("pads and clamps to the view box", () => {
    expect(padAndClamp({ x1: 2, y1: 100, x2: 300, y2: 795 }, 6, [0, 0, 612, 792])).toEqual({
      x1: 0,
      y1: 94,
      x2: 306,
      y2: 792,
    });
  });
});
