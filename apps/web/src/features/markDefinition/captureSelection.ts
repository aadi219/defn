import type { PdfRect, StyledRun } from "@deflink/core";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  clientRectToPage,
  cssRectToPdf,
  mergeLineRects,
  type PointConverter,
} from "@deflink/viewer";
import { resolveFontStyle } from "../../pdf/fontStyle";
import type { PageText } from "@deflink/viewer";
import { textNodeRects } from "@deflink/viewer";
import { selectedRawRange, styledRuns } from "./selectionRuns";

export interface CapturedSelection {
  pageNumber: number;
  rects: PdfRect[];
  /** Selected text with whitespace collapsed. */
  text: string;
  /** The selection split by font style, when every font's style is known (PLAN.md §6.4). */
  runs?: StyledRun[];
}

/** What capture needs from a rendered page to read font styles. */
export interface PageFonts {
  pageText: PageText;
  page: PDFPageProxy;
}

export type CaptureResult =
  | { ok: true; selection: CapturedSelection }
  | { ok: false; reason: "empty" | "outside" | "multiPage" };

function pageOf(node: Node): HTMLElement | null {
  const el = node instanceof Element ? node : node.parentElement;
  if (!el?.closest(".textLayer")) return null;
  return el.closest<HTMLElement>(".page");
}

/**
 * Reads the current selection (PLAN.md §6.1): it must be non-empty and inside one page's text
 * layer. Rects come from the selected text nodes only, merged per line and converted to PDF space.
 */
export function captureSelection(
  getViewport: (pageNumber: number) => PointConverter | undefined,
  getPageFonts: (pageNumber: number) => PageFonts | undefined,
): CaptureResult {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return { ok: false, reason: "empty" };
  const range = sel.getRangeAt(0);
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };

  const startPage = pageOf(range.startContainer);
  const endPage = pageOf(range.endContainer);
  if (!startPage && !endPage) return { ok: false, reason: "outside" };
  if (startPage !== endPage) return { ok: false, reason: "multiPage" };
  const pageEl = startPage!;
  const pageNumber = Number(pageEl.dataset.pageNumber);
  const viewport = getViewport(pageNumber);
  const textLayer = pageEl.querySelector(".textLayer");
  if (!viewport || !textLayer) return { ok: false, reason: "outside" };

  const cssRects = textNodeRects(range, textLayer).map((r) => clientRectToPage(r, pageEl));
  const rects = mergeLineRects(cssRects).map((r) => cssRectToPdf(r, viewport));
  if (rects.length === 0) return { ok: false, reason: "empty" };
  const runs = selectionRuns(range, getPageFonts(pageNumber));
  return { ok: true, selection: { pageNumber, rects, text, ...(runs ? { runs } : {}) } };
}

function selectionRuns(range: Range, fonts: PageFonts | undefined): StyledRun[] | undefined {
  if (!fonts) return undefined;
  const raw = selectedRawRange(range, fonts.pageText);
  if (!raw) return undefined;
  return styledRuns(fonts.pageText, raw.start, raw.end, (name) =>
    resolveFontStyle(fonts.page, name),
  );
}

export const CAPTURE_MESSAGES: Record<Exclude<CaptureResult, { ok: true }>["reason"], string> = {
  empty: "Select the definition text first.",
  outside: "Select text inside a page.",
  multiPage: "Definitions spanning pages aren't supported yet.",
};
