/** A text-layer span's range in the page's concatenated raw string. */
export interface Segment {
  node: Text;
  start: number;
  end: number;
  /** PDF.js font id (`TextItem.fontName`), for looking up the font's style. */
  fontName?: string;
}

export interface PageText {
  page: number;
  raw: string;
  segments: Segment[];
}

/** The geometry of a PDF.js text item needed to decide separators (PDF user space). */
export interface ItemGeometry {
  str: string;
  /** Baseline origin. */
  x: number;
  y: number;
  width: number;
  fontHeight: number;
  hasEOL: boolean;
}

/** Vertical baseline shift, as a fraction of font height, that starts a new line. */
const NEW_LINE_FRACTION = 0.5;
/** Horizontal gap, as a fraction of font height, that counts as a word space. */
const SPACE_FRACTION = 0.25;
/** A page counts as having a text layer when its trimmed text is longer than this. */
const MIN_PAGE_TEXT = 20;

/**
 * Concatenates text items into one string (PLAN.md §5.1). Between consecutive non-empty items it
 * inserts "\n" for a line change (an end-of-line flag, possibly on an empty item in between, or a
 * baseline shift over half the font height), " " for a horizontal gap over a quarter of the font
 * height, and nothing otherwise. Returns the raw string and each item's range in it; empty items
 * get an empty range at the current end.
 */
export function joinItems(items: ItemGeometry[]): {
  raw: string;
  ranges: { start: number; end: number }[];
} {
  let raw = "";
  const ranges: { start: number; end: number }[] = [];
  let prev: ItemGeometry | undefined;
  let pendingEOL = false;

  for (const item of items) {
    if (item.str.length === 0) {
      ranges.push({ start: raw.length, end: raw.length });
      pendingEOL ||= item.hasEOL;
      continue;
    }
    if (prev) raw += separator(prev, item, pendingEOL);
    ranges.push({ start: raw.length, end: raw.length + item.str.length });
    raw += item.str;
    prev = item;
    pendingEOL = item.hasEOL;
  }
  return { raw, ranges };
}

function separator(prev: ItemGeometry, next: ItemGeometry, eol: boolean): string {
  const height = Math.max(prev.fontHeight, next.fontHeight, 1e-6);
  if (eol || Math.abs(next.y - prev.y) > NEW_LINE_FRACTION * height) return "\n";
  const gap = next.x - (prev.x + prev.width);
  return gap > SPACE_FRACTION * height ? " " : "";
}

/**
 * Maps an offset in `raw` to a DOM position. Offsets inside a separator snap to the end of the
 * previous segment; offsets before the first segment snap to its start. Returns null when the page
 * has no segments.
 */
export function rawOffsetToDom(
  pageText: Pick<PageText, "segments">,
  offset: number,
): { node: Text; offset: number } | null {
  const { segments } = pageText;
  if (segments.length === 0) return null;
  // Last segment with start <= offset.
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid]!.start <= offset) lo = mid;
    else hi = mid - 1;
  }
  const seg = segments[lo]!;
  if (offset < seg.start) return { node: seg.node, offset: 0 };
  return { node: seg.node, offset: Math.min(offset, seg.end) - seg.start };
}

export function pageHasText(raw: string): boolean {
  return raw.trim().length > MIN_PAGE_TEXT;
}

const TEXT_NODE = 3;

/**
 * Builds PageText from a rendered text layer's DOM alone (PLAN.md §5.1's original approach), for
 * viewers whose PDF.js internals are out of reach (the Zotero reader). Leaf spans are read in DOM
 * order; separators come from their client rects, with a following `<br>` marking a line end.
 * Uses no `instanceof`, so it works on documents in other frames.
 */
export function buildPageTextFromDom(page: number, textLayer: Element): PageText {
  const spans = [...textLayer.querySelectorAll("span")].filter(
    (s) => s.firstChild?.nodeType === TEXT_NODE && !s.querySelector("span"),
  );
  const geometry: ItemGeometry[] = spans.map((s) => {
    const r = s.getBoundingClientRect();
    return {
      str: (s.firstChild as Text).data,
      x: r.left,
      y: r.bottom,
      width: r.width,
      fontHeight: r.height,
      hasEOL: s.nextSibling?.nodeName === "BR",
    };
  });
  const { raw, ranges } = joinItems(geometry);
  const segments: Segment[] = [];
  ranges.forEach((range, i) => {
    if (range.end > range.start) segments.push({ node: spans[i]!.firstChild as Text, ...range });
  });
  return { page, raw, segments };
}
