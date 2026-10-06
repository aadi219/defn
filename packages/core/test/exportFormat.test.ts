import { describe, expect, it } from "vitest";
import {
  planImport,
  validateExportFile,
  type Definition,
  type ExistingStore,
  type ExportCrop,
  type ExportFileV1,
  type Suppression,
  type Term,
} from "../src";

const docA = { type: "document", docId: "A" } as const;

function term(id: string, label: string, overrides: Partial<Term> = {}): Term {
  return {
    id,
    label,
    aliases: [],
    caseSensitive: false,
    scope: docA,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function def(id: string, termId: string): Definition {
  return {
    id,
    termId,
    kind: "definition",
    docId: "A",
    page: 1,
    rects: [{ x1: 0, y1: 0, x2: 10, y2: 10 }],
    text: "text",
    cropId: `crop-${id}`,
    createdAt: 1,
  };
}

const crop = (id: string): ExportCrop => ({
  id,
  dataUrl: "data:image/png;base64,AAAA",
  width: 10,
  height: 10,
});

function sup(id: string, termId: string, offset = 5): Suppression {
  return { id, termId, docId: "A", page: 2, offset };
}

function file(overrides: Partial<ExportFileV1> = {}): ExportFileV1 {
  return {
    format: "defn",
    version: 1,
    exportedAt: "2026-10-04T00:00:00.000Z",
    documents: [
      {
        id: "A",
        title: "Doc",
        fileName: "a.pdf",
        pageCount: 3,
        lastOpenedAt: 1,
        hasTextLayer: true,
      },
    ],
    terms: [term("t1", "compact space", { aliases: ["compact"] })],
    definitions: [def("d1", "t1")],
    crops: [crop("crop-d1")],
    suppressions: [sup("s1", "t1")],
    ...overrides,
  };
}

const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe("validateExportFile", () => {
  it("accepts a valid file", () => {
    const f = file({ definitions: [{ ...def("d1", "t1"), label: "Def 1.1", note: "n" }] });
    expect(validateExportFile(roundTrip(f))).toEqual({ ok: true, file: f });
  });

  it("strips unknown fields", () => {
    const f = roundTrip(file()) as { terms: Record<string, unknown>[] };
    f.terms[0]!.extra = 1;
    const result = validateExportFile(f);
    expect(result.ok && result.file.terms[0]).toEqual(file().terms[0]);
  });

  it("accepts files exported under the old name", () => {
    const result = validateExportFile(roundTrip({ ...file(), format: "deflink" }));
    expect(result.ok && result.file.format).toBe("defn");
  });

  it.each([
    ["not an object", 42, "file: expected an object"],
    ["wrong format", { ...file(), format: "other" }, 'format: expected "defn"'],
    ["wrong version", { ...file(), version: 2 }, "version: expected 1"],
    ["missing array", { ...file(), terms: undefined }, "terms: expected an array"],
    [
      "bad scope",
      file({ terms: [{ ...term("t1", "x"), scope: { type: "x" } as never }] }),
      "terms[0].scope.type",
    ],
    [
      "bad kind",
      file({ definitions: [{ ...def("d1", "t1"), kind: "axiom" as never }] }),
      "definitions[0].kind",
    ],
    ["page 0", file({ definitions: [{ ...def("d1", "t1"), page: 0 }] }), "definitions[0].page"],
    [
      "bad alias",
      file({ terms: [{ ...term("t1", "x"), aliases: [1] as never }] }),
      "terms[0].aliases[0]",
    ],
    [
      "non-image crop",
      file({ crops: [{ ...crop("crop-d1"), dataUrl: "data:text/html,x" }] }),
      "crops[0].dataUrl",
    ],
    ["duplicate id", file({ terms: [term("t1", "a"), term("t1", "b")] }), "terms[1].id"],
    ["dangling term", file({ definitions: [def("d1", "nope")] }), "definitions[0].termId"],
    ["dangling crop", file({ crops: [] }), "definitions[0].cropId"],
    ["dangling suppression", file({ suppressions: [sup("s1", "nope")] }), "suppressions[0].termId"],
  ])("rejects %s", (_name, input, message) => {
    const result = validateExportFile(roundTrip(input));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});

const empty: ExistingStore = {
  terms: [],
  documentIds: new Set(),
  definitionIds: new Set(),
  cropIds: new Set(),
  suppressions: [],
};

describe("planImport", () => {
  it("adds everything into an empty store", () => {
    const f = file();
    const plan = planImport(empty, f, { overwrite: false, now: 9 });
    expect(plan.terms).toEqual(f.terms);
    expect(plan.definitions).toEqual(f.definitions);
    expect(plan.crops).toEqual(f.crops);
    expect(plan.suppressions).toEqual(f.suppressions);
    expect(plan.added).toEqual({
      documents: 1,
      terms: 1,
      definitions: 1,
      crops: 1,
      suppressions: 1,
    });
    expect(plan.merged).toEqual([]);
  });

  it("skips records whose id exists, unless overwriting", () => {
    const existing: ExistingStore = {
      terms: [term("t1", "compact space", { aliases: ["compact"] })],
      documentIds: new Set(["A"]),
      definitionIds: new Set(["d1"]),
      cropIds: new Set(["crop-d1"]),
      suppressions: [sup("s1", "t1")],
    };
    const skip = planImport(existing, file(), { overwrite: false, now: 9 });
    expect(skip.skipped).toEqual({
      documents: 1,
      terms: 1,
      definitions: 1,
      crops: 1,
      suppressions: 1,
    });
    expect([skip.documents, skip.terms, skip.definitions, skip.crops, skip.suppressions]).toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);

    const over = planImport(existing, file(), { overwrite: true, now: 9 });
    expect(over.replaced).toEqual({
      documents: 1,
      terms: 1,
      definitions: 1,
      crops: 1,
      suppressions: 1,
    });
    expect(over.terms).toEqual(file().terms);
  });

  it("merges a colliding term into the existing one and remaps its records", () => {
    const existing: ExistingStore = { ...empty, terms: [term("x", "Compact Space")] };
    const plan = planImport(existing, file(), { overwrite: false, now: 9 });
    expect(plan.merged).toEqual([{ from: "compact space", into: "Compact Space" }]);
    expect(plan.terms).toEqual([
      term("x", "Compact Space", { aliases: ["compact"], updatedAt: 9 }),
    ]);
    expect(plan.definitions[0]!.termId).toBe("x");
    expect(plan.suppressions[0]!.termId).toBe("x");
    expect(plan.added.terms).toBe(0);
  });

  it("does not merge terms in different scopes", () => {
    const existing: ExistingStore = {
      ...empty,
      terms: [term("x", "compact space", { scope: { type: "global" } })],
    };
    const plan = planImport(existing, file(), { overwrite: false, now: 9 });
    expect(plan.merged).toEqual([]);
    expect(plan.terms.map((t) => t.id)).toEqual(["t1"]);
  });

  it("merges colliding terms within the file", () => {
    const f = file({
      terms: [term("t1", "compact space"), term("t2", "compact space", { aliases: ["compactum"] })],
      definitions: [def("d1", "t1"), { ...def("d2", "t2"), cropId: "crop-d1" }],
    });
    const plan = planImport(empty, f, { overwrite: false, now: 9 });
    expect(plan.terms).toEqual([
      term("t1", "compact space", { aliases: ["compactum"], updatedAt: 9 }),
    ]);
    expect(plan.definitions.map((d) => d.termId)).toEqual(["t1", "t1"]);
  });

  it("skips suppressions that duplicate an existing one after remapping", () => {
    const existing: ExistingStore = {
      ...empty,
      terms: [term("x", "compact space")],
      suppressions: [sup("old", "x")],
    };
    const plan = planImport(existing, file(), { overwrite: false, now: 9 });
    expect(plan.suppressions).toEqual([]);
    expect(plan.skipped.suppressions).toBe(1);
  });
});
