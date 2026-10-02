import { describe, expect, it } from "vitest";
import {
  findCollision,
  isValidTermLabel,
  parseAliases,
  sameScope,
  surfaceKey,
  type TermSurfaces,
} from "../src/collisions";
import type { Term } from "../src/model";

const docA = { type: "document", docId: "A" } as const;
const docB = { type: "document", docId: "B" } as const;
const global = { type: "global" } as const;

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

function candidate(label: string, overrides: Partial<TermSurfaces> = {}): TermSurfaces {
  return { label, aliases: [], caseSensitive: false, scope: docA, ...overrides };
}

describe("surfaceKey", () => {
  it("normalizes case, whitespace and hyphenation", () => {
    expect(surfaceKey("  Well-Defined Map ", false)).toBe("well defined map");
    expect(surfaceKey("Well-Defined", true)).toBe("Well Defined");
    expect(surfaceKey(" -- ", false)).toBe("");
  });
});

describe("sameScope", () => {
  it("compares scope type and document", () => {
    expect(sameScope(docA, { type: "document", docId: "A" })).toBe(true);
    expect(sameScope(docA, docB)).toBe(false);
    expect(sameScope(global, global)).toBe(true);
    expect(sameScope(global, docA)).toBe(false);
  });
});

describe("parseAliases", () => {
  it("splits, trims, collapses spaces and drops empties and duplicates", () => {
    expect(parseAliases(" compact ,compact  spaces,, compact ,")).toEqual([
      "compact",
      "compact spaces",
    ]);
    expect(parseAliases("")).toEqual([]);
  });
});

describe("isValidTermLabel", () => {
  it("requires a word token", () => {
    expect(isValidTermLabel("compact space")).toBe(true);
    expect(isValidTermLabel("  ")).toBe(false);
    expect(isValidTermLabel("--")).toBe(false);
  });
});

describe("findCollision", () => {
  const existing = [
    term("cs", "compact space", { aliases: ["compactum"] }),
    term("R", "Ring", { caseSensitive: true }),
    term("g", "group", { scope: global }),
  ];

  it("detects a label colliding with a label, ignoring case and spacing", () => {
    expect(findCollision(existing, candidate("Compact  Space"))?.id).toBe("cs");
  });

  it("detects a label colliding with an alias, and an alias with a label", () => {
    expect(findCollision(existing, candidate("compactum"))?.id).toBe("cs");
    expect(findCollision(existing, candidate("new", { aliases: ["compact space"] }))?.id).toBe(
      "cs",
    );
  });

  it("only considers the same scope", () => {
    expect(findCollision(existing, candidate("compact space", { scope: docB }))).toBeUndefined();
    expect(findCollision(existing, candidate("compact space", { scope: global }))).toBeUndefined();
    expect(findCollision(existing, candidate("group", { scope: global }))?.id).toBe("g");
    expect(findCollision(existing, candidate("group"))).toBeUndefined();
  });

  it("treats case-insensitive vs case-sensitive surfaces with equal folded forms as colliding", () => {
    expect(findCollision(existing, candidate("ring"))?.id).toBe("R");
  });

  it("lets two case-sensitive terms differing only in case coexist", () => {
    expect(findCollision(existing, candidate("RING", { caseSensitive: true }))).toBeUndefined();
    expect(findCollision(existing, candidate("Ring", { caseSensitive: true }))?.id).toBe("R");
  });

  it("ignores the term being edited", () => {
    expect(findCollision(existing, candidate("compact space"), "cs")).toBeUndefined();
  });

  it("ignores surfaces with no tokens", () => {
    const blank = [term("x", "--")];
    expect(findCollision(blank, candidate("..."))).toBeUndefined();
  });
});
