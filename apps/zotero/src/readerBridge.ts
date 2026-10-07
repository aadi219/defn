import type { PdfRect } from "@defn/core";
import type { PointConverter } from "@defn/viewer";

/**
 * All access to Zotero reader internals lives here (PLAN.md §M9), so a Zotero update can only
 * break this module. `connect` feature-detects what it needs and returns null if anything is
 * missing; callers then degrade to "mark only, no linking" (§12).
 *
 * Content-side JavaScript (PDF.js's `PDFViewerApplication`) is only read through
 * `wrappedJSObject` and called with numbers; no privileged callbacks are handed to it. Changes to
 * the text layer are observed with a MutationObserver on the DOM instead of PDF.js's event bus
 * (see `textLayerChangePage`).
 */

interface ContentViewport {
  scale: number;
  viewBox: ArrayLike<number>;
  convertToViewportPoint(x: number, y: number): ArrayLike<number>;
  convertToPdfPoint(x: number, y: number): ArrayLike<number>;
}

interface ContentPageView {
  viewport?: ContentViewport;
}

interface ContentPdfApp {
  pagesCount?: number;
  pdfViewer?: {
    pagesCount?: number;
    getPageView?(index: number): ContentPageView | undefined;
  };
}

type Waived<T> = { wrappedJSObject?: T };

export interface ReaderBridge {
  /** Defn document id: the attachment item key. */
  docId: string;
  title: string;
  fileName: string;
  item: ZoteroItem;
  /** Document of the PDF.js view (pages, text layers). */
  viewDoc: Document;
  pageCount(): number;
  /** The page element of a 1-based page, if rendered. */
  pageEl(page: number): HTMLElement | null;
  /** PDF user space <-> page CSS px at the page's current scale. */
  viewport(page: number): (PointConverter & { scale: number; viewBox: number[] }) | null;
  /**
   * Calls `onPage` (debounced) for pages whose text layer was attached, removed, shown, hidden or
   * changed; returns a disposer.
   */
  observeTextLayers(onPage: (page: number) => void): () => void;
  navigate(page: number, rects: readonly PdfRect[]): void;
}

const READY_TIMEOUT_MS = 15_000;
const POLL_MS = 100;
const TEXT_LAYER_DEBOUNCE_MS = 120;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pdfApp(win: Window): ContentPdfApp | undefined {
  return (win as unknown as Waived<{ PDFViewerApplication?: ContentPdfApp }>).wrappedJSObject
    ?.PDFViewerApplication;
}

/**
 * The PDF view's window as an Xray. Zotero creates `_internalReader` through `wrappedJSObject`, so
 * everything read through it is Xray-waived, and a waived window has no `wrappedJSObject` (that
 * only exists on Xrays): `pdfApp` would never find PDF.js and `connect` would time out.
 */
function viewWindow(reader: ZoteroReaderInstance): Window | undefined {
  const win = reader._internalReader?._primaryView?._iframeWindow;
  return win ? Components.utils.unwaiveXrays(win) : undefined;
}

/** The attachment's title for display: its parent item's title, else its own. */
function titleOf(item: ZoteroItem): string {
  const parent = item.parentItem;
  try {
    return (parent && parent.getField("title")) || item.getField("title") || item.key;
  } catch {
    return item.key;
  }
}

/**
 * Waits until the reader's PDF.js view has pages, then returns a bridge to it, or null if this
 * isn't a PDF reader or its internals don't look as expected.
 */
export async function connect(reader: ZoteroReaderInstance): Promise<ReaderBridge | null> {
  if (reader.type !== "pdf" || !reader._item) return null;
  const item = reader._item;
  try {
    await reader._initPromise;
    await reader._waitForReader?.();
  } catch {
    return null;
  }
  const started = Date.now();
  let win = viewWindow(reader);
  while (!(win && (pdfApp(win)?.pdfViewer?.pagesCount ?? 0) > 0)) {
    if (Date.now() - started > READY_TIMEOUT_MS) return null;
    await delay(POLL_MS);
    win = viewWindow(reader);
  }
  const app = pdfApp(win)!;
  const viewer = app.pdfViewer!;
  if (typeof viewer.getPageView !== "function") return null;
  const viewDoc = win.document;

  const viewport: ReaderBridge["viewport"] = (page) => {
    const vp = viewer.getPageView?.(page - 1)?.viewport;
    if (!vp || typeof vp.convertToViewportPoint !== "function") return null;
    const pair = (a: ArrayLike<number>) => [Number(a[0]), Number(a[1])];
    return {
      scale: Number(vp.scale),
      viewBox: Array.from(vp.viewBox, Number),
      convertToViewportPoint: (x, y) => pair(vp.convertToViewportPoint(x, y)),
      convertToPdfPoint: (x, y) => pair(vp.convertToPdfPoint(x, y)),
    };
  };

  return {
    docId: item.key,
    title: titleOf(item),
    fileName: (() => {
      try {
        return item.getField("title") || item.key;
      } catch {
        return item.key;
      }
    })(),
    item,
    viewDoc,
    pageCount: () => Number(viewer.pagesCount ?? app.pagesCount ?? 0),
    pageEl: (page) => viewDoc.querySelector<HTMLElement>(`.page[data-page-number="${page}"]`),
    viewport,
    observeTextLayers(onPage) {
      const pending = new Set<number>();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        timer = null;
        const pages = [...pending];
        pending.clear();
        for (const page of pages) onPage(page);
      };
      const observer = new (viewDoc.defaultView ?? window).MutationObserver((records) => {
        for (const r of records) {
          const page = textLayerChangePage(r);
          if (page) pending.add(page);
        }
        if (pending.size && !timer) timer = setTimeout(flush, TEXT_LAYER_DEBOUNCE_MS);
      });
      const root = viewDoc.getElementById("viewer") ?? viewDoc.body;
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"],
      });
      // Pages already rendered before we started observing.
      for (const el of viewDoc.querySelectorAll<HTMLElement>(".page .textLayer")) {
        const page = Number(el.closest<HTMLElement>(".page")?.dataset.pageNumber);
        if (page) pending.add(page);
      }
      if (pending.size) timer = setTimeout(flush, 0);
      return () => {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      };
    },
    navigate(page, rects) {
      void reader.navigate({
        position: { pageIndex: page - 1, rects: rects.map((r) => [r.x1, r.y1, r.x2, r.y2]) },
      });
    },
  };
}

const ELEMENT_NODE = 1;

const hasClass = (node: Node, name: string) =>
  node.nodeType === ELEMENT_NODE && (node as Element).classList.contains(name);

/**
 * The 1-based page whose text layer a mutation record shows was attached, removed, shown, hidden
 * or rewritten, or null for anything else. PDF.js renders a text layer off-DOM and appends it to
 * its page whole, hides it while re-rendering the page (zoom, scrolling back), and moves its
 * `.endOfContent` helper on every selection change, which is ignored.
 */
export function textLayerChangePage(record: MutationRecord): number | null {
  const target = record.target as Element;
  let changed: boolean;
  if (record.type === "attributes") {
    changed = hasClass(target, "textLayer");
  } else {
    const nodes = [...record.addedNodes, ...record.removedNodes];
    changed = target.closest?.(".textLayer")
      ? nodes.some((n) => !hasClass(n, "endOfContent"))
      : nodes.some((n) => hasClass(n, "textLayer"));
  }
  if (!changed) return null;
  const pageEl = target.closest?.(".page") as HTMLElement | null;
  return Number(pageEl?.dataset.pageNumber) || null;
}

/** Converts a Zotero position rect `[x1, y1, x2, y2]` (PDF user space) to a PdfRect. */
export function toPdfRect(r: readonly number[]): PdfRect {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = r;
  return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
}
