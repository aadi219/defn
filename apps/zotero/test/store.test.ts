import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Term } from "@defn/core";
import {
  DefnStore,
  emptyStore,
  parseStoreFile,
  TermCollisionError,
  type StoreIO,
} from "../src/store";

function fakeIO(initial?: unknown) {
  const files = new Map<string, unknown>();
  if (initial !== undefined) files.set("/data/store.json", initial);
  const io: StoreIO = {
    readJSON: async (p) => {
      if (!files.has(p)) throw new Error("missing");
      return structuredClone(files.get(p));
    },
    writeJSON: async (p, v) => void files.set(p, structuredClone(v)),
    writeBytes: async (p, b) => void files.set(p, b),
    readBytes: async (p) => files.get(p) as Uint8Array,
    makeDirectory: async () => {},
    remove: async (p) => {
      for (const k of [...files.keys()]) if (k === p || k.startsWith(`${p}/`)) files.delete(k);
    },
    join: (...parts) => parts.join("/"),
  };
  return { io, files };
}

function term(id: string, label: string): Term {
  return {
    id,
    label,
    aliases: [],
    caseSensitive: false,
    scope: { type: "document", docId: "KEY1" },
    createdAt: 1,
    updatedAt: 1,
  };
}

const input = (t: { create: Term } | { existingId: string }, id = "d1") => ({
  term: t,
  definition: {
    id,
    kind: "definition" as const,
    docId: "KEY1",
    page: 1,
    rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
    text: "A compact space is …",
    createdAt: 1,
  },
  crop: { id: `crop-${id}`, width: 10, height: 5, png: new Uint8Array([1, 2, 3]) },
});

describe("parseStoreFile", () => {
  it("accepts a store file and defaults annotation keys", () => {
    const old: Record<string, unknown> = { ...emptyStore() };
    delete old.annotationKeys;
    expect(parseStoreFile(old)).toEqual(emptyStore());
  });

  it("rejects other data", () => {
    for (const v of [null, 1, {}, { ...emptyStore(), version: 2 }, { ...emptyStore(), terms: 1 }]) {
      expect(parseStoreFile(v)).toBeNull();
    }
  });
});

describe("DefnStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a new definition with its term and crop, then persists after a delay", async () => {
    const { io, files } = fakeIO();
    const store = new DefnStore(io, "/data");
    await store.load();
    const changes = vi.fn();
    store.subscribe(changes);

    await store.saveNewDefinition(input({ create: term("t1", "compact space") }));
    expect(store.definitionsForDoc("KEY1").map((d) => d.termId)).toEqual(["t1"]);
    expect(files.get("/data/crops/crop-d1.png")).toEqual(new Uint8Array([1, 2, 3]));
    expect(changes).toHaveBeenCalledTimes(1);
    expect(files.has("/data/store.json")).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    const saved = parseStoreFile(files.get("/data/store.json"));
    expect(saved?.terms.map((t) => t.label)).toEqual(["compact space"]);
    expect(saved?.crops).toEqual([{ id: "crop-d1", width: 10, height: 5 }]);
  });

  it("notifies listeners only of changes that affect linking, but saves all of them", async () => {
    const { io, files } = fakeIO();
    const store = new DefnStore(io, "/data");
    await store.load();
    const changes = vi.fn();
    store.subscribe(changes);

    store.upsertDocument({
      id: "KEY1",
      title: "Topology",
      fileName: "topology.pdf",
      pageCount: 3,
      hasTextLayer: true,
    });
    store.setAnnotationKey("d1", "ABCD1234");
    expect(changes).not.toHaveBeenCalled();
    store.addSuppression({ id: "s1", termId: "t1", docId: "KEY1", page: 1, offset: 0 });
    expect(changes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(600);
    const saved = parseStoreFile(files.get("/data/store.json"));
    expect(saved?.documents.map((d) => d.title)).toEqual(["Topology"]);
    expect(saved?.annotationKeys).toEqual({ d1: "ABCD1234" });
  });

  it("reloads what it saved", async () => {
    const { io } = fakeIO();
    const a = new DefnStore(io, "/data");
    await a.load();
    await a.saveNewDefinition(input({ create: term("t1", "compact space") }));
    a.setAnnotationKey("d1", "ABCD1234");
    await a.flush();
    const b = new DefnStore(io, "/data");
    await b.load();
    expect(b.definitionsForTerm("t1")).toHaveLength(1);
  });

  it("rejects a colliding new term and adds to an existing one", async () => {
    const { io } = fakeIO();
    const store = new DefnStore(io, "/data");
    await store.load();
    await store.saveNewDefinition(input({ create: term("t1", "compact space") }));
    await expect(
      store.saveNewDefinition(input({ create: term("t2", "Compact  Space") }, "d2")),
    ).rejects.toBeInstanceOf(TermCollisionError);
    await store.saveNewDefinition(input({ existingId: "t1" }, "d2"));
    expect(store.definitionsForTerm("t1")).toHaveLength(2);
    expect(store.terms).toHaveLength(1);
  });

  it("clears all data, crops included, and saves at once", async () => {
    const { io, files } = fakeIO();
    const store = new DefnStore(io, "/data");
    await store.load();
    await store.saveNewDefinition(input({ create: term("t1", "compact space") }));
    store.setAnnotationKey("d1", "ABCD1234");
    expect(store.annotationKeys()).toEqual(["ABCD1234"]);
    const changes = vi.fn();
    store.subscribe(changes);

    await store.clear();
    expect(changes).toHaveBeenCalledTimes(1);
    expect(store.terms).toEqual([]);
    expect(store.annotationKeys()).toEqual([]);
    expect(files.has("/data/crops/crop-d1.png")).toBe(false);
    expect(files.get("/data/store.json")).toEqual(emptyStore());
  });

  it("starts empty from an unreadable file without overwriting it", async () => {
    const { io, files } = fakeIO({ something: "else" });
    const store = new DefnStore(io, "/data");
    await store.load();
    await store.flush();
    expect(store.terms).toEqual([]);
    expect(files.get("/data/store.json")).toEqual({ something: "else" });
  });
});
