import { describe, expect, it } from "vitest";
import type { Term } from "../src/model";
import {
  buildMatcherForDocument,
  createMatcherCache,
  isInScope,
  matchText,
  patternTokens,
  surfaceForms,
} from "../src/termIndex";

let nextId = 0;
function term(label: string, overrides: Partial<Term> = {}): Term {
  return {
    id: overrides.id ?? `t${nextId++}`,
    label,
    aliases: [],
    caseSensitive: false,
    scope: { type: "document", docId: "docA" },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function matchedIds(terms: Term[], docId: string, raw: string): string[] {
  return matchText(buildMatcherForDocument(terms, docId), raw).matches.map((m) => m.termId);
}

describe("termIndex", () => {
  it("lists surface forms label first", () => {
    expect(surfaceForms(term("compact space", { aliases: ["compact"] }))).toEqual([
      "compact space",
      "compact",
    ]);
  });

  it("normalizes and tokenizes pattern surfaces", () => {
    expect(patternTokens("  Compact\u00a0Space ", false)).toEqual(["compact", "space"]);
    expect(patternTokens("Compact Space", true)).toEqual(["Compact", "Space"]);
    expect(patternTokens("well-defined", false)).toEqual(["well", "defined"]);
  });

  it("includes global terms and terms scoped to the document only", () => {
    const g = term("group", { id: "g", scope: { type: "global" } });
    const a = term("ring", { id: "a" });
    const b = term("field", { id: "b", scope: { type: "document", docId: "docB" } });
    expect(isInScope(b, "docA")).toBe(false);
    expect(matchedIds([g, a, b], "docA", "group ring field")).toEqual(["g", "a"]);
    expect(matchedIds([g, a, b], "docB", "group ring field")).toEqual(["g", "b"]);
  });

  it("matches aliases", () => {
    const t = term("compact space", { id: "cs", aliases: ["compact", "compactum"] });
    expect(matchedIds([t], "docA", "a compactum is compact")).toEqual(["cs", "cs"]);
  });

  it("prefers a document-scoped term over a global one with the same surface", () => {
    const g = term("space", { id: "g", scope: { type: "global" } });
    const d = term("Space", { id: "d" });
    expect(matchedIds([g, d], "docA", "space")).toEqual(["d"]);
    expect(matchedIds([d, g], "docA", "space")).toEqual(["d"]);
    expect(matchedIds([g, d], "docB", "space")).toEqual(["g"]);
  });

  it("honours case sensitivity per term", () => {
    const t = term("Ring", { id: "R", caseSensitive: true });
    expect(matchedIds([t], "docA", "Ring ring RING")).toEqual(["R"]);
  });

  it("skips surfaces with no tokens", () => {
    const t = term("compact", { id: "c", aliases: ["", " - "] });
    expect(matchedIds([t], "docA", "compact")).toEqual(["c"]);
  });

  it("returns folded and cased normalizations of equal length", () => {
    const res = matchText(buildMatcherForDocument([term("x")], "docA"), "\u0130 Compact");
    expect(res.folded.text.length).toBe(res.cased.text.length);
  });

  it("memoizes on terms identity, document and options", () => {
    const build = createMatcherCache();
    const terms = [term("a")];
    const m1 = build(terms, "docA");
    expect(build(terms, "docA")).toBe(m1);
    expect(build(terms, "docA", { inflection: true })).toBe(m1);
    expect(build(terms, "docB")).not.toBe(m1);
    const m2 = build(terms, "docB");
    expect(build(terms, "docB", { inflection: false })).not.toBe(m2);
    expect(build([...terms], "docB", { inflection: false })).not.toBe(m2);
  });
});
