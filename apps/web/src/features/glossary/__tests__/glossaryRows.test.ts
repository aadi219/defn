import { describe, expect, it } from "vitest";
import type { Definition, DocumentRecord, Term } from "@deflink/core";
import { buildRows, filterRows, sortRows } from "../glossaryRows";

function term(id: string, label: string, overrides: Partial<Term> = {}): Term {
  return {
    id,
    label,
    aliases: [],
    caseSensitive: false,
    scope: { type: "document", docId: "A" },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function def(termId: string, text: string): Definition {
  return {
    id: `${termId}-${text}`,
    termId,
    kind: "definition",
    docId: "A",
    page: 1,
    rects: [],
    text,
    cropId: "c",
    createdAt: 0,
  };
}

const documents = new Map<string, DocumentRecord>([
  [
    "B",
    {
      id: "B",
      title: "Other book",
      fileName: "b.pdf",
      pageCount: 1,
      lastOpenedAt: 0,
      hasTextLayer: true,
    },
  ],
]);

const terms = [
  term("compact", "compact space", { aliases: ["compactum"], updatedAt: 3 }),
  term("open", "Open cover", { scope: { type: "global" }, updatedAt: 1 }),
  term("haus", "Hausdorff", { scope: { type: "document", docId: "B" }, updatedAt: 2 }),
  term("orphan", "ring", { scope: { type: "document", docId: "gone" } }),
];
const definitions = [
  def("compact", "every open cover has a finite subcover"),
  def("compact", "another definition"),
  def("open", "a cover by open sets"),
  def("haus", "points are separated"),
];
const rows = buildRows(terms, definitions, documents, "A");
const labels = (rs: { term: Term }[]) => rs.map((r) => r.term.label);

describe("buildRows", () => {
  it("counts definitions and labels scopes", () => {
    expect(rows.map((r) => [r.term.id, r.definitionCount, r.scopeLabel])).toEqual([
      ["compact", 2, "This document"],
      ["open", 1, "Global"],
      ["haus", 1, "Other book"],
      ["orphan", 0, "Unknown document"],
    ]);
  });
});

describe("filterRows", () => {
  it("searches labels, aliases and definition text, case-insensitively", () => {
    expect(labels(filterRows(rows, "COMPACTUM"))).toEqual(["compact space"]);
    expect(labels(filterRows(rows, "subcover"))).toEqual(["compact space"]);
    expect(labels(filterRows(rows, "open"))).toEqual(["compact space", "Open cover"]);
  });

  it("requires every word to match", () => {
    expect(labels(filterRows(rows, "open  sets"))).toEqual(["Open cover"]);
    expect(labels(filterRows(rows, "open xyz"))).toEqual([]);
  });

  it("returns all rows for an empty query, or only orphans", () => {
    expect(filterRows(rows, "  ")).toHaveLength(4);
    expect(labels(filterRows(rows, "", { orphanedOnly: true }))).toEqual(["ring"]);
  });
});

describe("sortRows", () => {
  it("sorts by label, ignoring case", () => {
    expect(labels(sortRows(rows, "label", "asc"))).toEqual([
      "compact space",
      "Hausdorff",
      "Open cover",
      "ring",
    ]);
  });

  it("sorts by definition count or update time, ties by label", () => {
    expect(labels(sortRows(rows, "definitions", "desc"))).toEqual([
      "compact space",
      "Hausdorff",
      "Open cover",
      "ring",
    ]);
    expect(labels(sortRows(rows, "updated", "asc"))).toEqual([
      "ring",
      "Open cover",
      "Hausdorff",
      "compact space",
    ]);
  });
});
