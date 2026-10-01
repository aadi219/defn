/** Size of a page in CSS px at scale 1 (PDF points). */
export interface PageSize {
  width: number;
  height: number;
}

export const PAGE_GAP = 12;
export const PAGE_PADDING = 16;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;

export interface Layout {
  scale: number;
  /** Top of each page in the scroll content, CSS px. Index 0 is page 1. */
  tops: number[];
  widths: number[];
  heights: number[];
  totalHeight: number;
  maxWidth: number;
}

/** Stacks pages vertically with a gap, at the given scale. */
export function computeLayout(sizes: PageSize[], scale: number): Layout {
  const tops: number[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  let y = PAGE_PADDING;
  let maxWidth = 0;
  for (const s of sizes) {
    const w = s.width * scale;
    const h = s.height * scale;
    tops.push(y);
    widths.push(w);
    heights.push(h);
    maxWidth = Math.max(maxWidth, w);
    y += h + PAGE_GAP;
  }
  const totalHeight = sizes.length ? y - PAGE_GAP + PAGE_PADDING : 0;
  return { scale, tops, widths, heights, totalHeight, maxWidth };
}

/** Index of the page containing content offset `y` (the gap below a page counts as that page). */
export function pageIndexAt(layout: Layout, y: number): number {
  const { tops } = layout;
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/** Inclusive index range of pages intersecting [scrollTop, scrollTop + viewportHeight). */
export function visibleRange(
  layout: Layout,
  scrollTop: number,
  viewportHeight: number,
): [number, number] {
  if (layout.tops.length === 0) return [0, -1];
  const first = pageIndexAt(layout, scrollTop);
  const firstVisible =
    layout.tops[first]! + layout.heights[first]! <= scrollTop ? first + 1 : first;
  const last = pageIndexAt(layout, scrollTop + Math.max(0, viewportHeight - 1));
  return [Math.min(firstVisible, last), last];
}

/** Scale that fits the widest page into a container of the given width. */
export function fitWidthScale(sizes: PageSize[], containerWidth: number): number {
  const widest = Math.max(1, ...sizes.map((s) => s.width));
  return clampScale((containerWidth - 2 * PAGE_PADDING) / widest);
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** A scroll position expressed relative to a page, so it survives zoom changes. */
export interface ScrollAnchor {
  index: number;
  /** Fraction (0–1) down the page of the anchor point. */
  fraction: number;
}

export function anchorAt(layout: Layout, y: number): ScrollAnchor {
  const index = pageIndexAt(layout, y);
  const h = layout.heights[index] ?? 1;
  const fraction = Math.min(1, Math.max(0, (y - layout.tops[index]!) / h));
  return { index, fraction };
}

export function offsetOf(layout: Layout, anchor: ScrollAnchor): number {
  return (layout.tops[anchor.index] ?? 0) + anchor.fraction * (layout.heights[anchor.index] ?? 0);
}
