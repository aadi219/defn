import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import { joinItems, type ItemGeometry, type PageText, type Segment } from "@defn/viewer";

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
    if (range.end > range.start && node instanceof Text) {
      segments.push({ node, ...range, fontName: items[i]!.fontName });
    }
  });
  return { page, raw, segments };
}
