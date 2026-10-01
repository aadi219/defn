// Generates e2e test PDFs into apps/web/e2e/fixtures/ (PLAN.md §9.1). Run with `pnpm fixtures`.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/e2e/fixtures");
const PAGE: [number, number] = [612, 792]; // US Letter
const MARGIN = 72;
const SIZE = 12;
const LEADING = 16;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

async function newDoc(title: string): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("deflink make-fixtures");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  return { doc, fonts };
}

/** A run of text in one font; a paragraph is a list of runs laid out with greedy word wrap. */
type Run = [text: string, font: keyof Fonts];

/**
 * Lays out runs from (x, y) within `width`, wrapping at spaces. Returns the y below the paragraph.
 * Each word is drawn separately so that styled runs keep their own font.
 */
function paragraph(page: PDFPage, fonts: Fonts, runs: Run[], x: number, y: number, width: number) {
  const space = fonts.regular.widthOfTextAtSize(" ", SIZE);
  let cx = x;
  for (const [text, fontKey] of runs) {
    const font = fonts[fontKey];
    const words = text.split(/(?<= )/); // keep trailing spaces attached
    for (const word of words) {
      const trimmed = word.trimEnd();
      const w = font.widthOfTextAtSize(trimmed, SIZE);
      if (cx > x && cx + w > x + width) {
        cx = x;
        y -= LEADING;
      }
      if (trimmed) page.drawText(trimmed, { x: cx, y, size: SIZE, font });
      cx += w + (word.endsWith(" ") ? space : 0);
    }
  }
  return y - LEADING * 1.5;
}

/** Draws each string as its own line, exactly as given (no wrapping). */
function lines(page: PDFPage, fonts: Fonts, text: string[], x: number, y: number) {
  for (const line of text) {
    page.drawText(line, { x, y, size: SIZE, font: fonts.regular });
    y -= LEADING;
  }
  return y - LEADING * 0.5;
}

async function simple() {
  const { doc, fonts } = await newDoc("Simple Topology");
  const width = PAGE[0] - 2 * MARGIN;

  const p1 = doc.addPage(PAGE);
  let y = PAGE[1] - MARGIN;
  y = paragraph(p1, fonts, [["1 Compactness", "bold"]], MARGIN, y, width);
  y = paragraph(
    p1,
    fonts,
    [
      ["Definition 1.1. ", "bold"],
      ["A ", "regular"],
      ["compact space", "italic"],
      [
        " is a topological space in which every open cover has a finite subcover.",
        "regular",
      ],
    ],
    MARGIN,
    y,
    width,
  );
  paragraph(
    p1,
    fonts,
    [["Compactness generalizes closed and bounded subsets of Euclidean space.", "regular"]],
    MARGIN,
    y,
    width,
  );

  const body: string[] = [
    "Every closed subset of a compact space is compact. The image of a compact space under a " +
      "continuous map is again compact.",
    "Finite unions of compact spaces are compact spaces. A product of two compact spaces is " +
      "compact, and Tychonoff's theorem extends this to arbitrary products.",
    "Theorem. Every Compact Space that is Hausdorff is normal. A metric space is compact if and " +
      "only if it is complete and totally bounded.",
    "The real line is not a compact space, but every closed interval in it is. Any space with " +
      "the discrete topology is compact exactly when it is finite.",
  ];
  for (let n = 0; n < 2; n++) {
    const page = doc.addPage(PAGE);
    let py = PAGE[1] - MARGIN;
    py = paragraph(page, fonts, [[`${n + 2} Properties`, "bold"]], MARGIN, py, width);
    for (const para of body) py = paragraph(page, fonts, [[para, "regular"]], MARGIN, py, width);
  }
  return doc;
}

async function hyphenated() {
  const { doc, fonts } = await newDoc("Hyphenated");
  const page = doc.addPage(PAGE);
  lines(
    page,
    fonts,
    [
      "Definition 1. A compact space is one in which every open",
      "cover has a finite subcover. In particular every com-",
      "pact space is a space, and a closed subset of a compact",
      "space is again compact.",
    ],
    MARGIN,
    PAGE[1] - MARGIN,
  );
  return doc;
}

async function twoColumn() {
  const { doc, fonts } = await newDoc("Two Column");
  const page = doc.addPage(PAGE);
  const gutter = 24;
  const colWidth = (PAGE[0] - 2 * MARGIN - gutter) / 2;
  const left =
    "Left column. A compact space is a topological space in which every open cover has a " +
    "finite subcover. Every closed subset of a compact space is compact.";
  const right =
    "Right column. The continuous image of a compact space is compact. A compact space that " +
    "is Hausdorff is normal.";
  const top = PAGE[1] - MARGIN;
  paragraph(page, fonts, [[left, "regular"]], MARGIN, top, colWidth);
  paragraph(page, fonts, [[right, "regular"]], MARGIN + colWidth + gutter, top, colWidth);
  return doc;
}

async function emptyText() {
  const { doc } = await newDoc("Scanned");
  const page = doc.addPage(PAGE);
  for (let i = 0; i < 20; i++) {
    page.drawRectangle({
      x: MARGIN,
      y: PAGE[1] - MARGIN - i * 28,
      width: (PAGE[0] - 2 * MARGIN) * (0.6 + 0.4 * ((i * 7) % 5) / 5),
      height: 10,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
  return doc;
}

/** A long document for checking lazy rendering and scrolling (not used by e2e tests). */
async function long() {
  const { doc, fonts } = await newDoc("Long Document");
  const width = PAGE[0] - 2 * MARGIN;
  const para =
    "In this section we study a compact space together with its open covers. A topological " +
    "space is called connected if it is not the union of two disjoint nonempty open sets. ";
  for (let n = 1; n <= 300; n++) {
    const page = doc.addPage(PAGE);
    let y = PAGE[1] - MARGIN;
    y = paragraph(page, fonts, [[`Page ${n}`, "bold"]], MARGIN, y, width);
    for (let k = 0; k < 6; k++) y = paragraph(page, fonts, [[para.repeat(2), "regular"]], MARGIN, y, width);
  }
  return doc;
}

const fixtures: Record<string, () => Promise<PDFDocument>> = {
  "simple.pdf": simple,
  "hyphenated.pdf": hyphenated,
  "two-column.pdf": twoColumn,
  "empty-text.pdf": emptyText,
  "long.pdf": long,
};

await mkdir(OUT_DIR, { recursive: true });
for (const [name, make] of Object.entries(fixtures)) {
  const bytes = await (await make()).save();
  await writeFile(join(OUT_DIR, name), bytes);
  console.log(`${name}: ${(bytes.length / 1024).toFixed(1)} KB`);
}
