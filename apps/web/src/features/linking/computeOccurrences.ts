import { matchText, normRangeToRaw, type TermMatcher } from "@deflink/core";
import { clientRectToPage, mergeLineRects } from "../../pdf/coords";
import { rawOffsetToDom, type PageText } from "../../pdf/pageText";
import { textNodeRects } from "../../pdf/rangeRects";
import type { Occurrence } from "./occurrences";

/**
 * Runs the matcher over a rendered page and locates every match on screen (PLAN.md §7.2 steps
 * 1–2): normalized offsets → raw offsets → DOM positions → text rects, merged per line and made
 * page-relative.
 */
export function computeOccurrences(
  pageText: PageText,
  pageEl: HTMLElement,
  matcher: TermMatcher,
): Occurrence[] {
  const textLayer = pageEl.querySelector(".textLayer");
  if (!textLayer || pageText.segments.length === 0) return [];
  const { folded, matches } = matchText(matcher, pageText.raw);
  const range = document.createRange();
  const occurrences: Occurrence[] = [];
  for (const m of matches) {
    const [rawStart, rawEnd] = normRangeToRaw(folded, pageText.raw, m.start, m.end);
    const start = rawOffsetToDom(pageText, rawStart);
    const end = rawOffsetToDom(pageText, rawEnd);
    if (!start || !end) continue;
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = mergeLineRects(
      textNodeRects(range, textLayer).map((r) => clientRectToPage(r, pageEl)),
    );
    if (rects.length > 0) occurrences.push({ termId: m.termId, start: m.start, end: m.end, rects });
  }
  return occurrences;
}
