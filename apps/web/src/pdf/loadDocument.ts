import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Served by the `deflink-pdfjs-assets` Vite plugin. */
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

export interface LoadedPdf {
  /** SHA-256 of the file bytes, lowercase hex. */
  docId: string;
  fileName: string;
  title: string;
  pdf: PDFDocumentProxy;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function loadPdf(file: File): Promise<LoadedPdf> {
  const bytes = await file.arrayBuffer();
  // Hash first: PDF.js transfers the buffer to its worker, which detaches it.
  const docId = await sha256Hex(bytes);
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  }).promise;
  const meta = await pdf.getMetadata().catch(() => undefined);
  const info = meta?.info as { Title?: unknown } | undefined;
  const metaTitle = typeof info?.Title === "string" ? info.Title.trim() : "";
  return { docId, fileName: file.name, title: metaTitle || file.name, pdf };
}
