import type { StyledRun } from "@deflink/core";
import type { FontStyle } from "../../pdf/fontStyle";
import type { PageText } from "../../pdf/pageText";

/** The selection as a range of offsets in the page's raw text, or null if it covers no segment. */
export function selectedRawRange(
  range: Range,
  pageText: PageText,
): { start: number; end: number } | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const seg of pageText.segments) {
    if (!range.intersectsNode(seg.node)) continue;
    start ??= seg.node === range.startContainer ? seg.start + range.startOffset : seg.start;
    end = seg.node === range.endContainer ? seg.start + range.endOffset : seg.end;
  }
  return start !== null && end !== null && end > start ? { start, end } : null;
}

/**
 * Splits `raw[start, end)` into runs by the font style of each segment. Separators between
 * segments are kept, at the end of the preceding run. Returns undefined if any segment's style is
 * unknown, so that suggestion falls back to patterns rather than trusting partial style information.
 */
export function styledRuns(
  pageText: Pick<PageText, "raw" | "segments">,
  start: number,
  end: number,
  styleOf: (fontName: string) => FontStyle | null,
): StyledRun[] | undefined {
  const runs: StyledRun[] = [];
  let prevEnd: number | null = null;
  for (const seg of pageText.segments) {
    if (seg.end <= start || seg.start >= end) continue;
    const style = seg.fontName === undefined ? null : styleOf(seg.fontName);
    if (!style) return undefined;
    const last = runs.at(-1);
    // Separators join the previous run, so styled runs hold only their own text.
    if (last && prevEnd !== null) last.text += pageText.raw.slice(prevEnd, seg.start);
    const text = pageText.raw.slice(Math.max(start, seg.start), Math.min(end, seg.end));
    prevEnd = seg.end;
    if (last && last.italic === style.italic && last.bold === style.bold) last.text += text;
    else runs.push({ text, ...style });
  }
  return runs;
}
