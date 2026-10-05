import { describe, expect, it } from "vitest";
import type { Segment } from "../../../pdf/pageText";
import { styledRuns } from "../selectionRuns";

// Fake text nodes: styledRuns never touches them.
const node = {} as Text;
const raw = "Definition 1.1. A compact space is a\ntopological space.";
const segments: Segment[] = [
  { node, start: 0, end: 15, fontName: "bold" }, // "Definition 1.1."
  { node, start: 16, end: 17, fontName: "roman" }, // "A"
  { node, start: 18, end: 31, fontName: "italic" }, // "compact space"
  { node, start: 32, end: 36, fontName: "roman" }, // "is a"
  { node, start: 37, end: 55, fontName: "roman" }, // "topological space."
];
const styles: Record<string, { italic: boolean; bold: boolean }> = {
  bold: { italic: false, bold: true },
  roman: { italic: false, bold: false },
  italic: { italic: true, bold: false },
};
const styleOf = (name: string) => styles[name] ?? null;

describe("styledRuns", () => {
  it("splits the selection by style, keeping separators", () => {
    expect(styledRuns({ raw, segments }, 0, raw.length, styleOf)).toEqual([
      { text: "Definition 1.1. ", italic: false, bold: true },
      { text: "A ", italic: false, bold: false },
      { text: "compact space ", italic: true, bold: false },
      { text: "is a\ntopological space.", italic: false, bold: false },
    ]);
  });

  it("clips the first and last segments to the selection", () => {
    expect(styledRuns({ raw, segments }, 26, 34, styleOf)).toEqual([
      { text: "space ", italic: true, bold: false },
      { text: "is", italic: false, bold: false },
    ]);
  });

  it("returns undefined if any style is unknown", () => {
    const unknown = [...segments, { node, start: 56, end: 60, fontName: "missing" }];
    expect(styledRuns({ raw: raw + " xxxx", segments: unknown }, 0, 60, styleOf)).toBeUndefined();
    expect(styledRuns({ raw, segments: [{ node, start: 0, end: 15 }] }, 0, 15, styleOf)).toBe(
      undefined,
    );
  });
});
