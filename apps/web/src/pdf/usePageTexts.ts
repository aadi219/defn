import { useCallback, useEffect, useRef } from "react";
import { clearSegmentOutlines, drawSegmentOutlines } from "../features/debug/segmentOutlines";
import { buildPageText, textItems, type PageText } from "./pageText";
import type { RenderedTextLayer } from "./PdfPage";

interface Entry {
  pageText: PageText;
  pageEl: HTMLElement;
}

/**
 * Keeps the PageText of every rendered page, rebuilt whenever a page's text layer (re)renders.
 * With `debugSegments`, outlines each page's segments.
 */
export function usePageTexts(debugSegments: boolean) {
  const entries = useRef(new Map<number, Entry>());
  const debugRef = useRef(debugSegments);

  const onTextLayer = useCallback((layer: RenderedTextLayer) => {
    const pageEl = layer.container.closest<HTMLElement>(".page");
    if (!pageEl) return;
    const pageText = buildPageText(
      layer.pageNumber,
      textItems(layer.textContent),
      layer.textLayer.textDivs,
    );
    entries.current.set(layer.pageNumber, { pageText, pageEl });
    if (debugRef.current) drawSegmentOutlines(pageEl, pageText);
  }, []);

  /** PageText of a page whose text layer is currently in the DOM. */
  const getPageText = useCallback((page: number): PageText | undefined => {
    const entry = entries.current.get(page);
    if (entry && !entry.pageEl.isConnected) entries.current.delete(page);
    return entry?.pageEl.isConnected ? entry.pageText : undefined;
  }, []);

  useEffect(() => {
    debugRef.current = debugSegments;
    for (const [page, { pageEl, pageText }] of entries.current) {
      if (!pageEl.isConnected) entries.current.delete(page);
      else if (debugSegments) drawSegmentOutlines(pageEl, pageText);
      else clearSegmentOutlines(pageEl);
    }
  }, [debugSegments]);

  // Dev aid: inspect page text from the console, e.g. `__deflink.pageText(1).raw`.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __deflink?: object };
    w.__deflink = { pageText: getPageText };
    return () => {
      delete w.__deflink;
    };
  }, [getPageText]);

  return { onTextLayer, getPageText };
}
