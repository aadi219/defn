import { describe, expect, it } from "vitest";
import {
  cleanCandidate,
  suggestFromPatterns,
  suggestFromRuns,
  suggestTerm,
  type StyledRun,
} from "../src";

const plain = (text: string): StyledRun => ({ text, italic: false, bold: false });
const italic = (text: string): StyledRun => ({ text, italic: true, bold: false });
const bold = (text: string): StyledRun => ({ text, italic: false, bold: true });

const SIMPLE =
  "Definition 1.1. A compact space is a topological space in which every open cover has a finite subcover.";

describe("cleanCandidate", () => {
  it("trims punctuation, whitespace and a leading article", () => {
    expect(cleanCandidate("  the  compact\nspace, ")).toBe("compact space");
    expect(cleanCandidate("“Hausdorff”.")).toBe("Hausdorff");
  });

  it("rejects empty, letterless and over-long candidates", () => {
    expect(cleanCandidate("")).toBe("");
    expect(cleanCandidate("1.2.")).toBe("");
    expect(cleanCandidate("one two three four five six")).toBe("");
    expect(cleanCandidate("one two three four five")).toBe("one two three four five");
  });
});

describe("heuristic 1: styled runs", () => {
  it("takes the first italic run, skipping a bold heading", () => {
    const runs = [
      bold("Definition 1.1."),
      plain(" A "),
      italic("compact space"),
      plain(" is a topological space"),
    ];
    expect(suggestFromRuns(runs)).toBe("compact space");
  });

  it("accepts bold terms and merges adjacent runs of the same style", () => {
    expect(suggestFromRuns([plain("A "), bold("well-"), bold("defined map"), plain(" is")])).toBe(
      "well-defined map",
    );
  });

  it("skips styled runs that are too long or have no letters", () => {
    const runs = [italic("this whole clause is in italics for emphasis"), italic(" "), plain("x")];
    expect(suggestFromRuns(runs)).toBe("");
    expect(suggestFromRuns([bold("2.3"), plain(" a "), italic("ring")])).toBe("ring");
  });

  it("skips single-letter variables", () => {
    expect(
      suggestFromRuns([plain("A space "), italic("X"), plain(" is "), italic("compact")]),
    ).toBe("compact");
  });

  it("wins over patterns", () => {
    expect(suggestTerm(SIMPLE, [plain("A "), italic("topological space")])).toEqual({
      term: "topological space",
      confidence: "high",
    });
  });
});

describe("heuristic 2: patterns", () => {
  it("Definition (term)", () => {
    expect(suggestFromPatterns("Definition 2.3 (Compact space). A space X is …")).toEqual({
      term: "Compact space",
      confidence: "high",
    });
    expect(suggestFromPatterns("Def. (Hausdorff) X is Hausdorff if")?.term).toBe("Hausdorff");
  });

  it("we say / we call", () => {
    expect(suggestFromPatterns("We say that a space is compact if every …")).toEqual({
      term: "compact",
      confidence: "high",
    });
    expect(suggestFromPatterns("we call the map an isomorphism if …")).toEqual({
      term: "isomorphism",
      confidence: "high",
    });
    expect(suggestFromPatterns("We say that X is a Hausdorff space when …")?.term).toBe(
      "Hausdorff space",
    );
  });

  it("falls back to the broad we say / we call form", () => {
    expect(suggestFromPatterns("We call a ring R Noetherian if …")).toEqual({
      term: "ring R Noetherian",
      confidence: "low",
    });
  });

  it("is called", () => {
    expect(suggestFromPatterns("Such a space is called compact if every …")).toEqual({
      term: "compact",
      confidence: "high",
    });
    expect(suggestFromPatterns("This number is called the Euler characteristic.")?.term).toBe(
      "Euler characteristic",
    );
  });

  it("a/the term is a …", () => {
    expect(suggestFromPatterns(SIMPLE)).toEqual({ term: "compact space", confidence: "low" });
    expect(suggestFromPatterns("An open cover is said to be finite if")?.term).toBe("open cover");
  });

  it("returns null when nothing matches", () => {
    expect(suggestFromPatterns("Every open cover has a finite subcover.")).toBeNull();
  });
});

describe("heuristic 3: fallback", () => {
  it("returns an empty, low-confidence suggestion", () => {
    expect(suggestTerm("Every open cover has a finite subcover.")).toEqual({
      term: "",
      confidence: "low",
    });
    expect(suggestTerm("Nothing here", [plain("Nothing here")])).toEqual({
      term: "",
      confidence: "low",
    });
  });
});
