import { describe, expect, it } from "vitest";
import type { Definition, Suppression, Term } from "@deflink/core";
import {
  filterOccurrences,
  firstDefinitionPages,
  hitTest,
  rectsIntersect,
  type FilterContext,
  type Occurrence,
} from "../src/occurrences";

const r = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

function occ(termId: string, start: number, ...rects: ReturnType<typeof r>[]): Occurrence {
  return { termId, start, end: start + 5, rects };
}

function term(id: string, scope: Term["scope"]): Term {
  return { id, label: id, aliases: [], caseSensitive: false, scope, createdAt: 0, updatedAt: 0 };
}

const terms = new Map([
  ["a", term("a", { type: "document", docId: "D" })],
  ["g", term("g", { type: "global" })],
]);

function ctx(overrides: Partial<FilterContext> = {}): FilterContext {
  return { page: 2, terms, suppressions: [], definitionRegions: [], ...overrides };
}

describe("rectsIntersect", () => {
  it("detects overlap and rejects touching edges", () => {
    expect(rectsIntersect(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true);
    expect(rectsIntersect(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
    expect(rectsIntersect(r(0, 0, 10, 10), r(0, 20, 10, 10))).toBe(false);
  });
});

describe("filterOccurrences", () => {
  const occurrences = [
    occ("a", 0, r(0, 0, 50, 10)),
    occ("a", 100, r(0, 40, 50, 10)),
    occ("g", 200, r(0, 80, 50, 10)),
  ];

  it("keeps everything by default", () => {
    expect(filterOccurrences(occurrences, ctx())).toHaveLength(3);
  });

  it("drops occurrences inside their own term's definition region only", () => {
    const definitionRegions = [
      { termId: "a", rects: [r(0, 35, 200, 20)] },
      { termId: "a", rects: [r(0, 75, 200, 20)] }, // overlaps g's occurrence, but a different term
    ];
    expect(filterOccurrences(occurrences, ctx({ definitionRegions })).map((o) => o.start)).toEqual([
      0, 200,
    ]);
  });

  it("drops suppressed occurrences by term and offset", () => {
    const suppressions: Suppression[] = [
      { id: "s", termId: "a", docId: "D", page: 2, offset: 100 },
      { id: "t", termId: "g", docId: "D", page: 2, offset: 0 }, // wrong term for offset 0
    ];
    expect(filterOccurrences(occurrences, ctx({ suppressions })).map((o) => o.start)).toEqual([
      0, 200,
    ]);
  });

  it("optionally drops document-scoped occurrences before the first definition page", () => {
    const firstDefinitionPage = new Map([
      ["a", 3],
      ["g", 3],
    ]);
    // Global term g is unaffected.
    expect(
      filterOccurrences(occurrences, ctx({ firstDefinitionPage })).map((o) => o.termId),
    ).toEqual(["g"]);
    expect(filterOccurrences(occurrences, ctx({ page: 3, firstDefinitionPage }))).toHaveLength(3);
  });
});

describe("firstDefinitionPages", () => {
  it("takes the earliest page per term", () => {
    const def = (termId: string, page: number) => ({ termId, page }) as Definition;
    expect(firstDefinitionPages([def("a", 5), def("a", 2), def("b", 7)])).toEqual(
      new Map([
        ["a", 2],
        ["b", 7],
      ]),
    );
  });
});

describe("hitTest", () => {
  const occurrences = [
    occ("a", 0, r(10, 10, 40, 12), r(0, 30, 20, 12)),
    occ("b", 50, r(100, 10, 30, 12)),
  ];

  it("finds the occurrence and the rect under the point", () => {
    expect(hitTest(occurrences, 5, 35)).toEqual({
      occurrence: occurrences[0],
      rect: r(0, 30, 20, 12),
    });
    expect(hitTest(occurrences, 110, 15)?.occurrence.termId).toBe("b");
  });

  it("returns null outside all rects", () => {
    expect(hitTest(occurrences, 70, 15)).toBeNull();
  });
});
