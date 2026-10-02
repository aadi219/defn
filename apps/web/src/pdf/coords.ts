import type { PdfRect } from "@deflink/core";

/** A rectangle in CSS px relative to a page element's top-left corner. */
export interface PageCssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The subset of PDF.js's PageViewport used for conversions (viewport = page CSS px). */
export interface PointConverter {
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}

/** Converts a viewport (client) rect to page-relative CSS px. */
export function clientRectToPage(rect: DOMRectReadOnly, pageEl: HTMLElement): PageCssRect {
  const page = pageEl.getBoundingClientRect();
  return {
    left: rect.left - page.left,
    top: rect.top - page.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Page CSS px → PDF user space, normalized so x1 <= x2 and y1 <= y2. */
export function cssRectToPdf(r: PageCssRect, viewport: PointConverter): PdfRect {
  const [ax = 0, ay = 0] = viewport.convertToPdfPoint(r.left, r.top);
  const [bx = 0, by = 0] = viewport.convertToPdfPoint(r.left + r.width, r.top + r.height);
  return {
    x1: Math.min(ax, bx),
    y1: Math.min(ay, by),
    x2: Math.max(ax, bx),
    y2: Math.max(ay, by),
  };
}

/** PDF user space → page CSS px (handles the y flip and page rotation). */
export function pdfRectToCss(r: PdfRect, viewport: PointConverter): PageCssRect {
  const [ax = 0, ay = 0] = viewport.convertToViewportPoint(r.x1, r.y1);
  const [bx = 0, by = 0] = viewport.convertToViewportPoint(r.x2, r.y2);
  const left = Math.min(ax, bx);
  const top = Math.min(ay, by);
  return { left, top, width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/** Tolerance for treating two rects as being on the same line. */
const SAME_LINE_PX = 2;

/**
 * Drops empty rects and merges rects on the same line (tops within 2 px) into their union,
 * returning them top to bottom (PLAN.md §6.1).
 */
export function mergeLineRects(rects: readonly PageCssRect[]): PageCssRect[] {
  const sorted = rects
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: PageCssRect[] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l.top - r.top) <= SAME_LINE_PX);
    if (!line) {
      lines.push({ ...r });
      continue;
    }
    const right = Math.max(line.left + line.width, r.left + r.width);
    const bottom = Math.max(line.top + line.height, r.top + r.height);
    line.left = Math.min(line.left, r.left);
    line.top = Math.min(line.top, r.top);
    line.width = right - line.left;
    line.height = bottom - line.top;
  }
  return lines;
}

/** Union bounding box of PDF rects, or null for none. */
export function unionPdfRects(rects: readonly PdfRect[]): PdfRect | null {
  if (rects.length === 0) return null;
  return rects.reduce((u, r) => ({
    x1: Math.min(u.x1, r.x1),
    y1: Math.min(u.y1, r.y1),
    x2: Math.max(u.x2, r.x2),
    y2: Math.max(u.y2, r.y2),
  }));
}

/** Pads a PDF rect on each side and clamps it to the page's view box [x1, y1, x2, y2]. */
export function padAndClamp(r: PdfRect, pad: number, viewBox: readonly number[]): PdfRect {
  const [vx1 = 0, vy1 = 0, vx2 = 0, vy2 = 0] = viewBox;
  return {
    x1: Math.max(vx1, r.x1 - pad),
    y1: Math.max(vy1, r.y1 - pad),
    x2: Math.min(vx2, r.x2 + pad),
    y2: Math.min(vy2, r.y2 + pad),
  };
}
