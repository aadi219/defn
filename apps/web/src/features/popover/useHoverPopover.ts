import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PageCssRect } from "@deflink/viewer";
import { hitTest, type Occurrence } from "@deflink/viewer";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
/** Pointer travel (px) between down and click beyond which the click counts as a drag. */
const CLICK_SLOP_PX = 4;
const POPOVER_SELECTOR = ".definition-popover";
const OVER_CLASS = "over-occurrence";

export interface PopoverTarget {
  page: number;
  pageEl: HTMLElement;
  occurrence: Occurrence;
  rect: PageCssRect;
  /** How it was opened; click- and keyboard-opened popovers take focus. */
  via: "hover" | "click" | "keyboard";
}

const keyOf = (t: { page: number; occurrence: Occurrence }) =>
  `${t.page}:${t.occurrence.termId}:${t.occurrence.start}`;

/**
 * Hover/click detection for linked occurrences (PLAN.md §7.2 hit testing, §7.3 timing). One
 * pointermove listener on the container hit-tests the page under the cursor, throttled with rAF.
 * `getOccurrences` must return only occurrences laid out at the page's current scale.
 */
export function useHoverPopover(
  containerRef: RefObject<HTMLElement | null>,
  getOccurrences: (page: number) => readonly Occurrence[] | undefined,
) {
  const [target, setTarget] = useState<PopoverTarget | null>(null);
  const targetRef = useRef<PopoverTarget | null>(null);
  const openTimer = useRef<{ key: string; id: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const getOccurrencesRef = useRef(getOccurrences);
  useEffect(() => {
    getOccurrencesRef.current = getOccurrences;
  }, [getOccurrences]);

  const show = useCallback((next: PopoverTarget | null) => {
    targetRef.current = next;
    setTarget(next);
  }, []);

  const cancelOpen = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current.id);
    openTimer.current = null;
  };
  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const close = useCallback(() => {
    cancelOpen();
    cancelClose();
    show(null);
  }, [show]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const hitAt = (
      clientX: number,
      clientY: number,
      el: Element | null,
      via: PopoverTarget["via"],
    ): PopoverTarget | null => {
      const pageEl = el?.closest<HTMLElement>(".page");
      if (!pageEl) return null;
      const page = Number(pageEl.dataset.pageNumber);
      const occurrences = getOccurrencesRef.current(page);
      if (!occurrences?.length) return null;
      const box = pageEl.getBoundingClientRect();
      const hit = hitTest(occurrences, clientX - box.left, clientY - box.top);
      return hit ? { page, pageEl, ...hit, via } : null;
    };

    const scheduleClose = () => {
      if (targetRef.current && closeTimer.current === null) {
        closeTimer.current = window.setTimeout(() => {
          closeTimer.current = null;
          show(null);
        }, CLOSE_DELAY_MS);
      }
    };

    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(POPOVER_SELECTOR)) {
        cancelClose();
        return;
      }
      // Ignore hovering while a button is held (e.g. drag-selecting text).
      const hit = e.buttons === 0 ? hitAt(e.clientX, e.clientY, el, "hover") : null;
      container.classList.toggle(OVER_CLASS, hit !== null);
      const current = targetRef.current;
      if (hit && current && keyOf(hit) === keyOf(current)) {
        cancelOpen();
        cancelClose();
        return;
      }
      if (!hit) {
        cancelOpen();
        scheduleClose();
        return;
      }
      const key = keyOf(hit);
      if (openTimer.current?.key === key) return;
      cancelOpen();
      openTimer.current = {
        key,
        id: window.setTimeout(() => {
          openTimer.current = null;
          cancelClose();
          show(hit);
        }, OPEN_DELAY_MS),
      };
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };

    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(POPOVER_SELECTOR)) return;
      const moved = down
        ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX
        : false;
      const selection = window.getSelection();
      if (moved || (selection && !selection.isCollapsed)) return;
      const hit = hitAt(e.clientX, e.clientY, el, "click");
      cancelOpen();
      cancelClose();
      show(hit);
    };
    const onLeave = () => {
      container.classList.remove(OVER_CLASS);
      cancelOpen();
      scheduleClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && targetRef.current) close();
    };

    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerdown", onDown);
    container.addEventListener("click", onClick);
    container.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      cancelOpen();
      cancelClose();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("click", onClick);
      container.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
    };
  }, [containerRef, show, close]);

  /** Opens the popover on a given occurrence, e.g. from keyboard navigation. */
  const open = useCallback(
    (next: PopoverTarget) => {
      cancelOpen();
      cancelClose();
      show(next);
    },
    [show],
  );

  return { target, open, close };
}
