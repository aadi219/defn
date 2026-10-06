import type { Definition } from "@defn/core";
import { pdfRectToCss, type PointConverter } from "@defn/viewer";

/** Definitions whose region contains the page-relative CSS point (x, y). */
export function definitionsAt(
  definitions: readonly Definition[],
  viewport: PointConverter,
  x: number,
  y: number,
): Definition[] {
  return definitions.filter((d) =>
    d.rects.some((rect) => {
      const r = pdfRectToCss(rect, viewport);
      return x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
    }),
  );
}
