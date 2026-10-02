import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  RenderingCancelledException,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";

/** Upper bound on canvas pixels, so high zoom on high-DPI screens can't exhaust memory. */
const MAX_CANVAS_PIXELS = 16_777_216;

export interface RenderedTextLayer {
  pageNumber: number;
  page: PDFPageProxy;
  container: HTMLDivElement;
  textContent: TextContent;
  textLayer: TextLayer;
  scale: number;
}

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  top: number;
  left: number;
  width: number;
  height: number;
  /** Render (or re-render at the current scale) when true; otherwise keep what is drawn. */
  shouldRender: boolean;
  onTextLayer?: (layer: RenderedTextLayer) => void;
  /** Rendered inside the overlay layer (no pointer events). */
  overlay?: ReactNode;
}

/**
 * One page: canvas, overlay layer (non-interactive) and PDF.js text layer on top. A re-render
 * (e.g. after zoom) draws into fresh elements and swaps them in when done, so nothing flashes.
 */
export const PdfPage = memo(function PdfPage(props: Props) {
  const { pdf, pageNumber, scale, top, left, width, height, shouldRender, onTextLayer, overlay } =
    props;
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const renderedScale = useRef<number | null>(null);
  const textContent = useRef<TextContent | null>(null);
  const onTextLayerRef = useRef(onTextLayer);
  onTextLayerRef.current = onTextLayer;

  useEffect(() => {
    if (!shouldRender || renderedScale.current === scale) return;
    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy["render"]> | undefined;
    let textLayer: TextLayer | undefined;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });

      const dpr = window.devicePixelRatio || 1;
      const outputScale = Math.min(
        dpr,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.dataset.outputScale = String(outputScale);
      renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (cancelled) return;
      canvasHost.current?.replaceChildren(canvas);

      textContent.current ??= await page.getTextContent();
      if (cancelled) return;
      const container = document.createElement("div");
      container.className = "textLayer";
      textLayer = new TextLayer({
        textContentSource: textContent.current,
        container,
        viewport,
      });
      await textLayer.render();
      if (cancelled) return;
      const end = document.createElement("div");
      end.className = "endOfContent";
      container.append(end);
      textHost.current?.replaceChildren(container);

      renderedScale.current = scale;
      onTextLayerRef.current?.({
        pageNumber,
        page,
        container,
        textContent: textContent.current,
        textLayer,
        scale,
      });
    })().catch((err: unknown) => {
      if (err instanceof RenderingCancelledException || cancelled) return;
      console.error(`Failed to render page ${pageNumber}`, err);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, shouldRender]);

  const style = {
    top,
    left,
    width,
    height,
    "--scale-factor": scale,
    "--total-scale-factor": scale,
  } as CSSProperties;

  return (
    <div className="page" data-page-number={pageNumber} style={style}>
      <div className="canvas-host" ref={canvasHost} />
      <div className="overlay-layer">{overlay}</div>
      {/* Filled imperatively by dev tools; React never renders into it. */}
      <div className="debug-host" />
      <div className="text-host" ref={textHost} />
    </div>
  );
});
