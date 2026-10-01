export type DefinitionKind =
  "definition" | "theorem" | "lemma" | "proposition" | "corollary" | "notation" | "other";

export const DEFINITION_KINDS: readonly DefinitionKind[] = [
  "definition",
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "notation",
  "other",
];

export type Scope = { type: "document"; docId: string } | { type: "global" };

export interface Term {
  id: string; // uuid
  label: string; // canonical display form, e.g. "compact space"
  aliases: string[]; // other surface forms, e.g. ["compact", "compact spaces"]
  caseSensitive: boolean;
  scope: Scope;
  createdAt: number;
  updatedAt: number;
}

/** A rectangle in PDF user-space units (origin bottom-left, as PDF.js uses). */
export interface PdfRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Definition {
  id: string;
  termId: string;
  kind: DefinitionKind;
  label?: string; // "Def 2.3"
  docId: string; // sha256 of the PDF bytes
  page: number; // 1-based
  rects: PdfRect[]; // selection rects, one per line fragment
  text: string; // extracted (normalized-whitespace) text of the selection
  cropId: string; // key into the crops table
  note?: string;
  createdAt: number;
}

export interface DocumentRecord {
  id: string; // sha256
  title: string; // PDF metadata title, else filename
  fileName: string;
  pageCount: number;
  lastOpenedAt: number;
  hasTextLayer: boolean;
}

/** User chose "Don't link here" on an occurrence. */
export interface Suppression {
  id: string;
  termId: string;
  docId: string;
  page: number;
  /** Character offset of the occurrence start in the page's normalized text. */
  offset: number;
}

/**
 * A rendered image of a definition region. Core stays DOM-free, so the binary payload type is a
 * parameter: the web app uses `Crop<Blob>`.
 */
export interface Crop<B = unknown> {
  id: string;
  blob: B; // PNG; exported as base64 data URL.
  width: number;
  height: number;
}
