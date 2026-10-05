import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PageViewport, PDFDocumentProxy } from "pdfjs-dist";
import type { PdfRect } from "@deflink/core";
import { pdfRectToCss } from "./coords";
import {
  anchorAt,
  clampScale,
  computeLayout,
  fitWidthScale,
  offsetOf,
  PAGE_PADDING,
  visibleRange,
  type ScrollAnchor,
} from "./layout";
import { shouldIgnoreShortcut } from "../util/keys";
import { PdfPage, type RenderedTextLayer } from "./PdfPage";

/** Pages within this distance of the visible range are rendered. */
const RENDER_MARGIN = 2;
/** Pages further than this from the visible range are unmounted, releasing their canvas. */
const KEEP_MARGIN = 5;
const ZOOM_STEP = 1.2;
/** Space left above a scrolled-to rect, CSS px. */
const SCROLL_TO_RECT_MARGIN = 80;

type Zoom = { mode: "fitWidth" } | { mode: "manual"; scale: number };

export interface PdfViewerHandle {
  scrollToPage(pageNumber: number): void;
  /** Viewport of a page at the current scale (page CSS px <-> PDF space). */
  getViewport(pageNumber: number): PageViewport | undefined;
  /** Scrolls so that a PDF-space rect on a page is near the top of the view. */
  scrollToPdfRect(pageNumber: number, rect: PdfRect): void;
}

interface Props {
  pdf: PDFDocumentProxy;
  /** Extra toolbar content, shown at the start of the toolbar. */
  toolbarStart?: ReactNode;
  /** Extra toolbar content, shown at the end of the toolbar. */
  toolbarEnd?: ReactNode;
  onTextLayer?: (layer: RenderedTextLayer) => void;
  /** Content drawn in a page's non-interactive overlay layer. */
  renderOverlay?: (pageNumber: number, viewport: PageViewport) => ReactNode;
}

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer(
  { pdf, toolbarStart, toolbarEnd, onTextLayer, renderOverlay },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null);
  /** Page viewports at scale 1; they double as page sizes for layout. */
  const [sizes, setSizes] = useState<PageViewport[] | null>(null);
  const [zoom, setZoom] = useState<Zoom>({ mode: "fitWidth" });
  const [viewport, setViewport] = useState({ scrollTop: 0, width: 0, height: 0 });

  // Page sizes at scale 1, for layout before pages render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const numbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      const result = await Promise.all(
        numbers.map(async (n) => (await pdf.getPage(n)).getViewport({ scale: 1 })),
      );
      if (!cancelled) setSizes(result);
    })().catch((err: unknown) => console.error("Failed to read page sizes", err));
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Track the scroll container's size and position.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setViewport({ scrollTop: el.scrollTop, width: el.clientWidth, height: el.clientHeight });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    el.addEventListener("scroll", schedule, { passive: true });
    update();
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  const scale = useMemo(() => {
    if (!sizes) return 1;
    return zoom.mode === "fitWidth" ? fitWidthScale(sizes, viewport.width) : zoom.scale;
  }, [sizes, zoom, viewport.width]);

  const layout = useMemo(() => computeLayout(sizes ?? [], scale), [sizes, scale]);
  const viewports = useMemo(() => sizes?.map((v) => v.clone({ scale })) ?? [], [sizes, scale]);
  const [first, last] = visibleRange(layout, viewport.scrollTop, viewport.height);
  const centerIndex = anchorAt(layout, viewport.scrollTop + viewport.height / 2).index;
  const pageCount = pdf.numPages;

  // Keep the reading position when the scale changes.
  const anchor = useRef<{ scale: number; anchor: ScrollAnchor } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    const prev = anchor.current;
    if (el && prev && prev.scale !== scale && sizes) {
      el.scrollTop = offsetOf(layout, prev.anchor);
    }
  }, [layout, scale, sizes]);
  useEffect(() => {
    const el = scroller.current;
    if (el && sizes) anchor.current = { scale, anchor: anchorAt(layout, el.scrollTop) };
  }, [layout, scale, sizes, viewport.scrollTop]);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const el = scroller.current;
      const index = Math.min(pageCount, Math.max(1, pageNumber)) - 1;
      if (el && layout.tops[index] !== undefined) {
        el.scrollTop = layout.tops[index] - PAGE_PADDING;
      }
    },
    [layout, pageCount],
  );
  useImperativeHandle(
    ref,
    () => ({
      scrollToPage,
      getViewport: (pageNumber) => viewports[pageNumber - 1],
      scrollToPdfRect(pageNumber, rect) {
        const el = scroller.current;
        const viewport = viewports[pageNumber - 1];
        const top = layout.tops[pageNumber - 1];
        if (!el || !viewport || top === undefined) return;
        const css = pdfRectToCss(rect, viewport);
        el.scrollTop = Math.max(0, top + css.top - SCROLL_TO_RECT_MARGIN);
      },
    }),
    [scrollToPage, viewports, layout],
  );

  const zoomBy = useCallback(
    (factor: number) => setZoom({ mode: "manual", scale: clampScale(scale * factor) }),
    [scale],
  );

  // Keyboard: arrows / j k page, Home / End, + - zoom, 0 fit width.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      const current = centerIndex + 1;
      const actions: Record<string, () => void> = {
        ArrowRight: () => scrollToPage(current + 1),
        j: () => scrollToPage(current + 1),
        ArrowLeft: () => scrollToPage(current - 1),
        k: () => scrollToPage(current - 1),
        Home: () => scrollToPage(1),
        End: () => scrollToPage(pageCount),
        "+": () => zoomBy(ZOOM_STEP),
        "=": () => zoomBy(ZOOM_STEP),
        "-": () => zoomBy(1 / ZOOM_STEP),
        "0": () => setZoom({ mode: "fitWidth" }),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [centerIndex, pageCount, scrollToPage, zoomBy]);

  // While drag-selecting, mark the text layer so PDF.js CSS stops the selection from jumping.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      const layer = (e.target as Element | null)?.closest?.(".textLayer");
      layer?.classList.add("selecting");
    };
    const up = () => {
      for (const layer of el.querySelectorAll(".textLayer.selecting")) {
        layer.classList.remove("selecting");
      }
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  // Focus the scroller so Page Up / Page Down / Space scroll it.
  useEffect(() => scroller.current?.focus({ preventScroll: true }), [pdf]);

  const contentWidth = Math.max(viewport.width, layout.maxWidth + 2 * PAGE_PADDING);
  const pages: ReactNode[] = [];
  if (sizes) {
    const from = Math.max(0, first - KEEP_MARGIN);
    const to = Math.min(sizes.length - 1, last + KEEP_MARGIN);
    for (let i = from; i <= to; i++) {
      const w = layout.widths[i]!;
      pages.push(
        <PdfPage
          key={i}
          pdf={pdf}
          pageNumber={i + 1}
          scale={scale}
          top={layout.tops[i]!}
          left={Math.max(PAGE_PADDING, (contentWidth - w) / 2)}
          width={w}
          height={layout.heights[i]!}
          shouldRender={i >= first - RENDER_MARGIN && i <= last + RENDER_MARGIN}
          onTextLayer={onTextLayer}
          overlay={renderOverlay?.(i + 1, viewports[i]!)}
        />,
      );
    }
  }

  return (
    <div className="viewer">
      <div className="toolbar" role="toolbar" aria-label="Document controls">
        {toolbarStart}
        <span className="spacer" />
        <PageIndicator current={centerIndex + 1} count={pageCount} onGo={scrollToPage} />
        <span className="toolbar-group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
            −
          </button>
          <span className="zoom-level">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom({ mode: "fitWidth" })}
            aria-pressed={zoom.mode === "fitWidth"}
          >
            Fit width
          </button>
        </span>
        {toolbarEnd}
      </div>
      <div className="scroller" ref={scroller} tabIndex={-1}>
        <div className="pages" style={{ height: layout.totalHeight, width: contentWidth }}>
          {pages}
        </div>
        {!sizes && <p className="loading">Loading pages…</p>}
      </div>
    </div>
  );
});

function PageIndicator(props: { current: number; count: number; onGo: (page: number) => void }) {
  const { current, count, onGo } = props;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <form
      className="page-indicator"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(draft);
        if (Number.isInteger(n)) onGo(n);
        setDraft(null);
      }}
    >
      <input
        aria-label="Page number"
        inputMode="numeric"
        value={draft ?? String(current)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        size={Math.max(2, String(count).length)}
      />
      <span> / {count}</span>
    </form>
  );
}
