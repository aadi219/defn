import { describe, expect, it } from "vitest";
import { TermMatcher, type MatcherOptions, type Pattern } from "../src/matcher";
import { normalize } from "../src/normalize";
import { tokenize } from "../src/tokenize";

function pattern(termId: string, surface: string, caseSensitive = false, priority = 0): Pattern {
  const tokens = tokenize(normalize(surface, { caseSensitive }).text).map((t) => t.text);
  return { termId, tokens, caseSensitive, priority };
}

/** Runs the matcher over raw text and returns [termId, matched folded text] pairs. */
function run(patterns: Pattern[], raw: string, options?: MatcherOptions): [string, string][] {
  const folded = normalize(raw, { caseSensitive: false }).text;
  const cased = normalize(raw, { caseSensitive: true }).text;
  const m = new TermMatcher(patterns, options);
  return m
    .find(tokenize(folded), tokenize(cased))
    .map((x) => [x.termId, folded.slice(x.start, x.end)]);
}

describe("TermMatcher", () => {
  it("prefers the longest match", () => {
    const patterns = [
      pattern("space", "space"),
      pattern("compact", "compact"),
      pattern("chs", "compact Hausdorff space"),
    ];
    expect(run(patterns, "Every compact Hausdorff space is a compact space.")).toEqual([
      ["chs", "compact hausdorff space"],
      ["compact", "compact"],
      ["space", "space"],
    ]);
  });

  it("falls back to a shorter match when a longer prefix does not complete", () => {
    const patterns = [pattern("c", "compact"), pattern("chs", "compact Hausdorff space")];
    expect(run(patterns, "compact Hausdorff group")).toEqual([["c", "compact"]]);
  });

  it("does not match inside larger words", () => {
    expect(run([pattern("ring", "ring")], "a string of rings, ringing")).toEqual([
      ["ring", "rings"],
    ]);
  });

  it("matches plurals and singulars", () => {
    const patterns = [
      pattern("cs", "compact space"),
      pattern("os", "open sets"),
      pattern("b", "basis"),
    ];
    expect(run(patterns, "compact spaces; an open set; basises")).toEqual([
      ["cs", "compact spaces"],
      ["os", "open set"],
      ["b", "basises"],
    ]);
  });

  it("matches -es plurals", () => {
    expect(run([pattern("m", "match")], "two matches")).toEqual([["m", "matches"]]);
  });

  it("does not inflect tokens shorter than 3 characters", () => {
    expect(run([pattern("x", "ab")], "ab abs")).toEqual([["x", "ab"]]);
  });

  it("can disable inflection", () => {
    expect(run([pattern("s", "space")], "space spaces", { inflection: false })).toEqual([
      ["s", "space"],
    ]);
  });

  it("prefers an exact pattern over an inflected variant", () => {
    // "space" inflects to "spaces", but a term literally named "spaces" should win there.
    const patterns = [pattern("space", "space"), pattern("spaces", "spaces")];
    expect(run(patterns, "space spaces")).toEqual([
      ["space", "space"],
      ["spaces", "spaces"],
    ]);
  });

  it("respects case-sensitive terms", () => {
    expect(run([pattern("R", "Ring", true)], "A Ring and a ring")).toEqual([["R", "ring"]]);
  });

  it("prefers the case-sensitive match on a tie", () => {
    const patterns = [pattern("ring", "ring"), pattern("Ring", "Ring", true)];
    expect(run(patterns, "Ring theory: every ring")).toEqual([
      ["Ring", "ring"],
      ["ring", "ring"],
    ]);
  });

  it("prefers a longer case-insensitive match over a shorter case-sensitive one", () => {
    const patterns = [pattern("R", "Ring", true), pattern("rt", "ring theory")];
    expect(run(patterns, "Ring theory")).toEqual([["rt", "ring theory"]]);
  });

  it("uses priority to pick between identical patterns", () => {
    const patterns = [pattern("global", "space", false, 0), pattern("doc", "space", false, 1)];
    expect(run(patterns, "space")).toEqual([["doc", "space"]]);
    expect(run(patterns.slice().reverse(), "space")).toEqual([["doc", "space"]]);
  });

  it("matches across a dehyphenated line break", () => {
    expect(run([pattern("cs", "compact space")], "every com-\npact space")).toEqual([
      ["cs", "compact space"],
    ]);
  });

  it("matches hyphenated compounds against hyphenated patterns", () => {
    expect(run([pattern("wd", "well-defined")], "is well defined and well-defined")).toEqual([
      ["wd", "well defined"],
      ["wd", "well-defined"],
    ]);
  });

  it("ignores empty patterns and empty input", () => {
    const m = new TermMatcher([{ termId: "x", tokens: [], caseSensitive: false }]);
    expect(m.find([], [])).toEqual([]);
  });
});
