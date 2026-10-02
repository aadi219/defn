import { clientRectToPage } from "../../pdf/coords";
import type { PageText } from "../../pdf/pageText";

const LAYER_CLASS = "debug-layer";

/** Dev aid: outlines every PageText segment on the page, alternating colours. */
export function drawSegmentOutlines(pageEl: HTMLElement, pageText: PageText): void {
  const layer = debugLayer(pageEl);
  if (!layer) return;
  const boxes: HTMLElement[] = [];
  const range = document.createRange();
  pageText.segments.forEach((seg, i) => {
    range.setStart(seg.node, 0);
    range.setEnd(seg.node, seg.node.length);
    for (const rect of range.getClientRects()) {
      const r = clientRectToPage(rect, pageEl);
      const box = document.createElement("div");
      box.className = `debug-segment debug-segment-${i % 2}`;
      Object.assign(box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      boxes.push(box);
    }
  });
  layer.replaceChildren(...boxes);
}

export function clearSegmentOutlines(pageEl: HTMLElement): void {
  pageEl.querySelector(`.${LAYER_CLASS}`)?.replaceChildren();
}

function debugLayer(pageEl: HTMLElement): HTMLElement | null {
  const overlay = pageEl.querySelector<HTMLElement>(".overlay-layer");
  if (!overlay) return null;
  let layer = overlay.querySelector<HTMLElement>(`.${LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = LAYER_CLASS;
    overlay.append(layer);
  }
  return layer;
}
