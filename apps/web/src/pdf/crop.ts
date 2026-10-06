import type { PdfRect } from "@defn/core";
import type { PDFPageProxy } from "pdfjs-dist";
import { padAndClamp, pdfRectToCss, unionPdfRects } from "@defn/viewer";

const PADDING = 6; // PDF units
const MAX_BYTES = 300 * 1024;
const SCALES = [2, 1.5];

export interface CropImage {
  blob: Blob;
  /** Pixel size of the image. */
  width: number;
  height: number;
  /** Render scale (pixels per PDF unit); display at width / scale CSS px for 100% size. */
  scale: number;
}

/**
 * Renders the padded union of `rects` to a PNG (PLAN.md §6.3). Only the crop area is drawn: the
 * page is rendered into a canvas the size of the crop, translated so the region lands at 0,0.
 * Falls back to scale 1.5 if the PNG is over 300 KB.
 */
export async function renderCrop(page: PDFPageProxy, rects: PdfRect[]): Promise<CropImage> {
  const union = unionPdfRects(rects);
  if (!union) throw new Error("No rects to crop");
  const region = padAndClamp(union, PADDING, page.view);
  let image: CropImage | undefined;
  for (const scale of SCALES) {
    image = await renderRegion(page, region, scale);
    if (image.blob.size <= MAX_BYTES) break;
  }
  return image!;
}

async function renderRegion(page: PDFPageProxy, region: PdfRect, scale: number) {
  const viewport = page.getViewport({ scale });
  const css = pdfRectToCss(region, viewport);
  const left = Math.floor(css.left);
  const top = Math.floor(css.top);
  const width = Math.max(1, Math.ceil(css.left + css.width) - left);
  const height = Math.max(1, Math.ceil(css.top + css.height) - top);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -left, -top] }).promise;
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png"),
  );
  return { blob, width, height, scale };
}
