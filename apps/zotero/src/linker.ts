import { createMatcherCache, isInScope } from "@defn/core";
import {
  buildPageTextFromDom,
  computeOccurrences,
  filterOccurrences,
  hitTest,
  pdfRectToCss,
  type Occurrence,
  type PageCssRect,
} from "@defn/viewer";
import { ensureStyle, h } from "./dom";
import { DefinitionPopover } from "./popover";
import type { ReaderBridge } from "./readerBridge";
import type { DefnStore } from "./store";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
const CLICK_SLOP_PX = 4;

const CSS = `
.defn-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.defn-underline { position: absolute; box-sizing: border-box;
  border-bottom: 1.5px dotted rgb(47 91 211 / 0.85); }
`;

interface LinkedPage {
  occurrences: Occurrence[];
  overlay: HTMLElement;
}

interface Hit {
  page: number;
  pageEl: HTMLElement;
  occurrence: Occurrence;
  rect: PageCssRect;
}

const keyOf = (h: Hit) => `${h.page}:${h.occurrence.termId}:${h.occurrence.start}`;

/**
 * Links one Zotero PDF reader (PLAN.md §7.2–7.3 in the plugin): underlines every occurrence of a
 * known term on rendered pages, and opens a popover on hover (300 ms) or click.
 */
export class ReaderLinker {
  private pages = new Map<number, LinkedPage>();
  private matcherFor = createMatcherCache();
  private disposers: (() => void)[] = [];
  private popover: { hit: Hit; view: DefinitionPopover } | null = null;
  private openTimer: { key: string; id: ReturnType<typeof setTimeout> } | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly bridge: ReaderBridge,
    private readonly store: DefnStore,
  ) {}

  get alive(): boolean {
    const win = this.bridge.viewDoc.defaultView;
    return !!win && !win.closed;
  }

  start() {
    const { viewDoc } = this.bridge;
    ensureStyle(viewDoc, "defn-linker-style", CSS);
    this.disposers.push(this.bridge.observeTextLayers((page) => this.safelyLinkPage(page)));
    this.disposers.push(this.store.subscribe(() => this.relinkAll()));
    this.listenForPointer();
  }

  stop() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.closePopover();
    for (const { overlay } of this.pages.values()) overlay.remove();
    this.pages.clear();
  }

  private relinkAll() {
    this.closePopover();
    for (const el of this.bridge.viewDoc.querySelectorAll<HTMLElement>(".page")) {
      const page = Number(el.dataset.pageNumber);
      if (page && (el.querySelector(".textLayer") || this.pages.has(page))) {
        this.safelyLinkPage(page);
      }
    }
  }

  /** Links a page; a failure is logged and leaves other pages and the caller unaffected. */
  private safelyLinkPage(page: number) {
    try {
      this.linkPage(page);
    } catch (err) {
      Zotero.debug(`Defn: could not link page ${page}`);
      Zotero.logError(err);
    }
  }

  private unlinkPage(page: number) {
    this.pages.get(page)?.overlay.remove();
    this.pages.delete(page);
  }

  private linkPage(page: number) {
    const { bridge, store } = this;
    const pageEl = bridge.pageEl(page);
    const textLayer = pageEl?.querySelector<HTMLElement>(".textLayer");
    // PDF.js hides a page's text layer while re-rendering it, and showing it again relinks it.
    // Without terms for this document there is nothing to measure.
    const hasTerms = store.terms.some((t) => isInScope(t, bridge.docId));
    const viewport = hasTerms && textLayer && !textLayer.hidden ? bridge.viewport(page) : null;
    if (!pageEl || !textLayer || !viewport) {
      this.unlinkPage(page);
      return;
    }
    let overlay = pageEl.querySelector<HTMLElement>(":scope > .defn-overlay");
    if (!overlay) {
      overlay = h(bridge.viewDoc, "div", { className: "defn-overlay", "aria-hidden": "true" });
      pageEl.append(overlay);
    }

    const pageText = buildPageTextFromDom(page, textLayer);
    const matcher = this.matcherFor(store.terms, bridge.docId);
    // Rects come relative to the page's border box; the overlay sits in its padding box, which is
    // also where the PDF.js viewport (and so the definition regions) has its origin.
    const pageBox = pageEl.getBoundingClientRect();
    const origin = overlay.getBoundingClientRect();
    const dx = origin.left - pageBox.left;
    const dy = origin.top - pageBox.top;
    const found = computeOccurrences(pageText, pageEl, matcher).map((o) => ({
      ...o,
      rects: o.rects.map((r) => ({ ...r, left: r.left - dx, top: r.top - dy })),
    }));
    const definitions = store.definitionsForDoc(bridge.docId).filter((d) => d.page === page);
    const occurrences = filterOccurrences(found, {
      page,
      terms: new Map(store.terms.map((t) => [t.id, t])),
      suppressions: store.suppressionsForDoc(bridge.docId).filter((s) => s.page === page),
      definitionRegions: definitions.map((d) => ({
        termId: d.termId,
        rects: d.rects.map((r) => pdfRectToCss(r, viewport)),
      })),
    });

    overlay.replaceChildren(
      ...occurrences.flatMap((o) =>
        o.rects.map((r) => {
          const line = h(bridge.viewDoc, "div", { className: "defn-underline" });
          Object.assign(line.style, {
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          });
          return line;
        }),
      ),
    );
    this.pages.set(page, { occurrences, overlay });
  }

  /** The linked occurrence under a client point, found by page geometry (overlays take no events). */
  private hitAt(x: number, y: number): Hit | null {
    for (const [page, linked] of this.pages) {
      const pageEl = this.bridge.pageEl(page);
      if (!pageEl || !linked.overlay.isConnected) continue;
      const box = linked.overlay.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      const hit = hitTest(linked.occurrences, x - box.left, y - box.top);
      return hit ? { page, pageEl, ...hit } : null;
    }
    return null;
  }

  private listenForPointer() {
    const doc = this.bridge.viewDoc;
    const win = doc.defaultView;
    if (!win) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    let down: { x: number; y: number } | null = null;

    const update = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      if (this.popover?.view.contains(e.target as Node)) {
        this.cancelClose();
        return;
      }
      const hit = e.buttons === 0 ? this.hitAt(e.clientX, e.clientY) : null;
      doc.documentElement.style.cursor = hit ? "help" : "";
      if (hit && this.popover && keyOf(hit) === keyOf(this.popover.hit)) {
        this.cancelOpen();
        this.cancelClose();
        return;
      }
      if (!hit) {
        this.cancelOpen();
        this.scheduleClose();
        return;
      }
      const key = keyOf(hit);
      if (this.openTimer?.key === key) return;
      this.cancelOpen();
      this.openTimer = {
        key,
        id: setTimeout(() => {
          this.openTimer = null;
          this.open(hit);
        }, OPEN_DELAY_MS),
      };
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = win.requestAnimationFrame(update);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e: MouseEvent) => {
      if (this.popover?.view.contains(e.target as Node)) return;
      const moved = down
        ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX
        : false;
      if (moved) return;
      const hit = this.hitAt(e.clientX, e.clientY);
      this.cancelOpen();
      if (hit) this.open(hit);
      else this.closePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.popover) this.closePopover();
    };
    const onScroll = () => this.closePopover();

    // Capture phase: the reader may stop propagation of pointer events on its own layers.
    doc.addEventListener("pointermove", onMove, { capture: true, passive: true });
    doc.addEventListener("pointerdown", onDown, true);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("scroll", onScroll, true);
    this.disposers.push(() => {
      if (frame) win.cancelAnimationFrame(frame);
      this.cancelOpen();
      this.cancelClose();
      doc.documentElement.style.cursor = "";
      doc.removeEventListener("pointermove", onMove, true);
      doc.removeEventListener("pointerdown", onDown, true);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("scroll", onScroll, true);
    });
  }

  private open(hit: Hit) {
    const term = this.store.terms.find((t) => t.id === hit.occurrence.termId);
    if (!term) return;
    this.closePopover();
    const page = hit.pageEl.getBoundingClientRect();
    const overlay = this.pages.get(hit.page)?.overlay.getBoundingClientRect() ?? page;
    const anchor = {
      left: overlay.left + hit.rect.left,
      top: overlay.top + hit.rect.top,
      width: hit.rect.width,
      height: hit.rect.height,
    };
    const view = new DefinitionPopover(
      this.bridge.viewDoc,
      this.store,
      term,
      this.bridge.docId,
      anchor,
      {
        goToSource: (d) => {
          this.closePopover();
          this.bridge.navigate(d.page, d.rects);
        },
        dontLinkHere: () => {
          this.closePopover();
          this.store.addSuppression({
            id: Services.uuid.generateUUID().toString().slice(1, -1),
            termId: hit.occurrence.termId,
            docId: this.bridge.docId,
            page: hit.page,
            offset: hit.occurrence.start,
          });
        },
      },
    );
    view.el.addEventListener("pointerleave", () => this.scheduleClose());
    view.el.addEventListener("pointerenter", () => this.cancelClose());
    this.popover = { hit, view };
  }

  private closePopover() {
    this.cancelClose();
    this.popover?.view.remove();
    this.popover = null;
  }

  private cancelOpen() {
    if (this.openTimer) clearTimeout(this.openTimer.id);
    this.openTimer = null;
  }

  private cancelClose() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  private scheduleClose() {
    if (!this.popover || this.closeTimer) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.closePopover();
    }, CLOSE_DELAY_MS);
  }
}
