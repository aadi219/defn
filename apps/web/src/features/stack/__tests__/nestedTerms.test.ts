import { describe, expect, it } from "vitest";
import { buildMatcherForDocument, type Term } from "@defn/core";
import { nestedTermIds } from "../nestedTerms";

function term(id: string, label: string, aliases: string[] = []): Term {
  return {
    id,
    label,
    aliases,
    caseSensitive: false,
    scope: { type: "document", docId: "D" },
    createdAt: 0,
    updatedAt: 0,
  };
}

const matcher = buildMatcherForDocument(
  [
    term("compact", "compact space"),
    term("cover", "open cover", ["cover"]),
    term("top", "topological space"),
  ],
  "D",
);

describe("nestedTermIds", () => {
  it("lists other terms in order of first mention, once each", () => {
    const text =
      "A compact space is a topological space in which every open cover has a finite subcover. " +
      "Every cover of a topological space …";
    expect(nestedTermIds(matcher, text, "compact")).toEqual(["top", "cover"]);
  });

  it("returns nothing when only the own term is mentioned", () => {
    expect(nestedTermIds(matcher, "compact spaces are compact spaces", "compact")).toEqual([]);
  });
});
