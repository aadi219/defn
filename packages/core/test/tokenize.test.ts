import { describe, expect, it } from "vitest";
import { tokenize } from "../src/tokenize";

const texts = (s: string) => tokenize(s).map((t) => t.text);

describe("tokenize", () => {
  it("splits on whitespace and punctuation with offsets", () => {
    expect(tokenize("a compact, space.")).toEqual([
      { text: "a", start: 0, end: 1 },
      { text: "compact", start: 2, end: 9 },
      { text: "space", start: 11, end: 16 },
    ]);
  });

  it("splits hyphenated compounds", () => {
    expect(texts("well-defined map")).toEqual(["well", "defined", "map"]);
  });

  it("keeps a single apostrophe suffix", () => {
    expect(texts("Zorn's lemma, it\u2019s 'quoted'")).toEqual([
      "Zorn's",
      "lemma",
      "it\u2019s",
      "quoted",
    ]);
  });

  it("includes digits and non-Latin letters", () => {
    expect(texts("L2 space \u00e9tale \u0394-complex")).toEqual([
      "L2",
      "space",
      "\u00e9tale",
      "\u0394",
      "complex",
    ]);
  });

  it("returns nothing for empty or punctuation-only text", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(" .,;- ")).toEqual([]);
  });
});
