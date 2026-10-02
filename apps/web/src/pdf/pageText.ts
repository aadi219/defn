import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";

/** A text-layer span's range in the page's concatenated raw string. */
export interface Segment {
  node: Text;
  start: number;
  end: number;
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

export function itemGeometry(item: TextItem): ItemGeometry {
  const [, , c, d, e, f] = item.transform as number[];
  return {
    str: item.str,
    x: e ?? 0,
    y: f ?? 0,
    width: item.width,
    fontHeight: Math.hypot(c ?? 0, d ?? 0),
    hasEOL: item.hasEOL,
  };
}

/** Text items (not marked-content markers), in the same order as `TextLayer.textDivs`. */
export function textItems(content: TextContent): TextItem[] {
  return content.items.filter((it): it is TextItem => "str" in it);
}

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

/** Builds PageText from a rendered text layer: `textDivs[i]` renders `items[i]`. */
export function buildPageText(
  page: number,
  items: TextItem[],
  textDivs: readonly HTMLElement[],
): PageText {
  const { raw, ranges } = joinItems(items.map(itemGeometry));
  const segments: Segment[] = [];
  ranges.forEach((range, i) => {
    const node = textDivs[i]?.firstChild;
    if (range.end > range.start && node instanceof Text) segments.push({ node, ...range });
  });
  return { page, raw, segments };
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
