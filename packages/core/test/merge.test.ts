import { describe, expect, it } from "vitest";
import { mergeTermInto, type Term } from "../src";

const docA = { type: "document", docId: "A" } as const;

function term(id: string, label: string, overrides: Partial<Term> = {}): Term {
  return {
    id,
    label,
    aliases: [],
    caseSensitive: false,
    scope: docA,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("mergeTermInto", () => {
  it("adds the source label and aliases as aliases of the target", () => {
    const a = term("a", "compact space", { aliases: ["compact"] });
    const b = term("b", "compact set", { aliases: ["compacta"], scope: { type: "global" } });
    const { term: merged, dropped } = mergeTermInto(a, b, [a, b], 42);
    expect(merged).toEqual({
      ...a,
      aliases: ["compact", "compact set", "compacta"],
      updatedAt: 42,
    });
    expect(dropped).toEqual([]);
  });

  it("skips forms the target already has, by normalized key", () => {
    const a = term("a", "well-defined", { aliases: ["Compact"] });
    const b = term("b", "well defined", { aliases: ["compact", "COMPACT", "map"] });
    expect(mergeTermInto(a, b, [], 1).term.aliases).toEqual(["Compact", "map"]);
  });

  it("keeps case variants when the target is case-sensitive", () => {
    const a = term("a", "Ring", { caseSensitive: true });
    const b = term("b", "RING");
    expect(mergeTermInto(a, b, [], 1).term.aliases).toEqual(["RING"]);
  });

  it("drops forms that collide with another term in the target's scope", () => {
    const a = term("a", "compact space");
    const b = term("b", "compact set", { aliases: ["space"], scope: { type: "global" } });
    const c = term("c", "space");
    const { term: merged, dropped } = mergeTermInto(a, b, [a, b, c], 1);
    expect(merged.aliases).toEqual(["compact set"]);
    expect(dropped).toEqual(["space"]);
  });
});
