import type { PDFPageProxy } from "pdfjs-dist";

export interface FontStyle {
  italic: boolean;
  bold: boolean;
}

/** "Times-Italic", "MinionPro-BoldIt", LaTeX's "CMTI10" (text italic, not math "CMMI"). */
const ITALIC = /italic|oblique|-(?:bold)?it(?![a-z])|CMTI\d|CMSL\d/i;
/** "Times-Bold", "Helvetica-Bd", LaTeX's "CMBX10". */
const BOLD = /bold|-bd(?![a-z])|CMBX\d|CMB\d/i;

/** Style implied by a PostScript font name (PLAN.md §6.4). */
export function styleFromFontName(name: string): FontStyle {
  return { italic: ITALIC.test(name), bold: BOLD.test(name) };
}

/**
 * Style of a loaded font, from its name and PDF.js's italic/bold flags. Returns null if the font
 * isn't loaded (fonts load while the canvas renders) or the lookup fails.
 */
export function resolveFontStyle(page: PDFPageProxy, fontName: string): FontStyle | null {
  try {
    if (!page.commonObjs.has(fontName)) return null;
    const font = page.commonObjs.get(fontName) as {
      name?: unknown;
      italic?: unknown;
      bold?: unknown;
    } | null;
    if (!font) return null;
    const byName = styleFromFontName(typeof font.name === "string" ? font.name : "");
    return {
      italic: byName.italic || font.italic === true,
      bold: byName.bold || font.bold === true,
    };
  } catch {
    return null;
  }
}
