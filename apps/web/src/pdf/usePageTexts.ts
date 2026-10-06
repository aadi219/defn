import { useCallback, useEffect, useRef } from "react";
import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import { clearSegmentOutlines, drawSegmentOutlines } from "../features/debug/segmentOutlines";
import type { PageText } from "@deflink/viewer";
import { buildPageText, textItems } from "./pageText";
import type { RenderedTextLayer } from "./PdfPage";

/** A page whose text layer is rendered, with what is needed to locate text on it. */
export interface PageTextEntry {
  pageText: PageText;
  pageEl: HTMLElement;
  page: PDFPageProxy;
  /** Scale the text layer was rendered at, and the matching viewport. */
  scale: number;
  viewport: PageViewport;
}

/**
 * Keeps the PageText of every rendered page, rebuilt whenever a page's text layer (re)renders,
 * and calls `onPageText` for each rebuild. With `debugSegments`, outlines each page's segments.
 */
export function usePageTexts(debugSegments: boolean, onPageText?: (entry: PageTextEntry) => void) {
  const entries = useRef(new Map<number, PageTextEntry>());
  const debugRef = useRef(debugSegments);
  const listener = useRef(onPageText);
  useEffect(() => {
    listener.current = onPageText;
  }, [onPageText]);

  const onTextLayer = useCallback((layer: RenderedTextLayer) => {
    const pageEl = layer.container.closest<HTMLElement>(".page");
    if (!pageEl) return;
    const pageText = buildPageText(
      layer.pageNumber,
      textItems(layer.textContent),
      layer.textLayer.textDivs,
    );
    const entry: PageTextEntry = {
      pageText,
      pageEl,
      page: layer.page,
      scale: layer.scale,
      viewport: layer.page.getViewport({ scale: layer.scale }),
    };
    entries.current.set(layer.pageNumber, entry);
    if (debugRef.current) drawSegmentOutlines(pageEl, pageText);
    listener.current?.(entry);
  }, []);

  /** Entries of pages whose text layer is currently in the DOM. */
  const liveEntries = useCallback((): PageTextEntry[] => {
    const live: PageTextEntry[] = [];
    for (const [page, entry] of entries.current) {
      if (entry.pageEl.isConnected) live.push(entry);
      else entries.current.delete(page);
    }
    return live;
  }, []);

  /** Entry of a page whose text layer is currently in the DOM. */
  const getEntry = useCallback(
    (page: number): PageTextEntry | undefined =>
      liveEntries().find((e) => e.pageText.page === page),
    [liveEntries],
  );
  const getPageText = useCallback(
    (page: number): PageText | undefined => getEntry(page)?.pageText,
    [getEntry],
  );

  useEffect(() => {
    debugRef.current = debugSegments;
    for (const { pageEl, pageText } of liveEntries()) {
      if (debugSegments) drawSegmentOutlines(pageEl, pageText);
      else clearSegmentOutlines(pageEl);
    }
  }, [debugSegments, liveEntries]);

  // Dev aid: inspect page text from the console, e.g. `__deflink.pageText(1).raw`.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __deflink?: object };
    w.__deflink = { pageText: getPageText };
    return () => {
      delete w.__deflink;
    };
  }, [getPageText]);

  return { onTextLayer, getEntry, liveEntries };
}
