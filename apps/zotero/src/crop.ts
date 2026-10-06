import type { PdfRect } from "@deflink/core";
import { padAndClamp, pdfRectToCss, unionPdfRects } from "@deflink/viewer";
import type { ReaderBridge } from "./readerBridge";

/** Padding around the selection, in PDF units (PLAN.md §6.3). */
const PAD = 4;

export interface CropResult {
  png: Uint8Array;
  /** Display size at 100% zoom. */
  width: number;
  height: number;
}

/** Decodes a base64 PNG data URL without relying on sandbox globals such as `atob`. */
export function dataUrlToBytes(dataUrl: string, atobFn: (s: string) => string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atobFn(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Copies the selected region from the page canvas the reader has already rendered (PLAN.md §6.3,
 * adapted: Zotero's PDF.js can't be asked to render from privileged code without exporting
 * functions into its compartment). Resolution is that of the current zoom. Returns null if the
 * page isn't rendered.
 */
export function cropFromCanvas(
  bridge: ReaderBridge,
  page: number,
  rects: readonly PdfRect[],
): CropResult | null {
  const pageEl = bridge.pageEl(page);
  const viewport = bridge.viewport(page);
  const source =
    pageEl?.querySelector<HTMLCanvasElement>(".canvasWrapper canvas") ??
    pageEl?.querySelector<HTMLCanvasElement>("canvas");
  const union = unionPdfRects(rects);
  if (!pageEl || !viewport || !source || !union || pageEl.clientWidth === 0) return null;
  const css = pdfRectToCss(padAndClamp(union, PAD, viewport.viewBox), viewport);
  const ratio = source.width / pageEl.clientWidth;
  const w = Math.max(1, Math.round(css.width * ratio));
  const h = Math.max(1, Math.round(css.height * ratio));
  const canvas = bridge.viewDoc.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, css.left * ratio, css.top * ratio, w, h, 0, 0, w, h);
  const win = bridge.viewDoc.defaultView;
  if (!win) return null;
  return {
    png: dataUrlToBytes(canvas.toDataURL("image/png"), (s) => win.atob(s)),
    width: css.width / viewport.scale,
    height: css.height / viewport.scale,
  };
}
