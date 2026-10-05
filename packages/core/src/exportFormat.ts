import { findCollision } from "./collisions";
import { mergeTermInto } from "./merge";
import {
  DEFINITION_KINDS,
  type Definition,
  type DefinitionKind,
  type DocumentRecord,
  type PdfRect,
  type Scope,
  type Suppression,
  type Term,
} from "./model";

/** A crop in an export file: the PNG as a data URL. */
export interface ExportCrop {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
}

/** The JSON export of the whole store (PLAN.md §8). */
export interface ExportFileV1 {
  format: "deflink";
  version: 1;
  /** ISO timestamp. */
  exportedAt: string;
  documents: DocumentRecord[];
  terms: Term[];
  definitions: Definition[];
  crops: ExportCrop[];
  suppressions: Suppression[];
}

export type ValidationResult = { ok: true; file: ExportFileV1 } | { ok: false; error: string };

class InvalidFile extends Error {}

function fail(path: string, expected: string): never {
  throw new InvalidFile(`${path}: expected ${expected}`);
}

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "an object");
  return v as Obj;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "an array");
  return v;
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== "string") fail(`${path}.${key}`, "a string");
  return v;
}

function optStr(o: Obj, key: string, path: string): string | undefined {
  return o[key] === undefined ? undefined : str(o, key, path);
}

function nonEmpty(o: Obj, key: string, path: string): string {
  const v = str(o, key, path);
  if (!v) fail(`${path}.${key}`, "a non-empty string");
  return v;
}

function num(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${path}.${key}`, "a finite number");
  return v;
}

function int(o: Obj, key: string, path: string, min: number): number {
  const v = num(o, key, path);
  if (!Number.isInteger(v) || v < min) fail(`${path}.${key}`, `an integer ≥ ${min}`);
  return v;
}

function bool(o: Obj, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== "boolean") fail(`${path}.${key}`, "a boolean");
  return v;
}

function scope(v: unknown, path: string): Scope {
  const o = obj(v, path);
  if (o.type === "global") return { type: "global" };
  if (o.type === "document") return { type: "document", docId: nonEmpty(o, "docId", path) };
  fail(`${path}.type`, `"global" or "document"`);
}

function rect(v: unknown, path: string): PdfRect {
  const o = obj(v, path);
  return {
    x1: num(o, "x1", path),
    y1: num(o, "y1", path),
    x2: num(o, "x2", path),
    y2: num(o, "y2", path),
  };
}

function documentRecord(v: unknown, path: string): DocumentRecord {
  const o = obj(v, path);
  return {
    id: nonEmpty(o, "id", path),
    title: str(o, "title", path),
    fileName: str(o, "fileName", path),
    pageCount: int(o, "pageCount", path, 0),
    lastOpenedAt: num(o, "lastOpenedAt", path),
    hasTextLayer: bool(o, "hasTextLayer", path),
  };
}

function term(v: unknown, path: string): Term {
  const o = obj(v, path);
  const aliases = arr(o.aliases, `${path}.aliases`).map((a, i) => {
    if (typeof a !== "string") fail(`${path}.aliases[${i}]`, "a string");
    return a;
  });
  return {
    id: nonEmpty(o, "id", path),
    label: nonEmpty(o, "label", path),
    aliases,
    caseSensitive: bool(o, "caseSensitive", path),
    scope: scope(o.scope, `${path}.scope`),
    createdAt: num(o, "createdAt", path),
    updatedAt: num(o, "updatedAt", path),
  };
}

function definition(v: unknown, path: string): Definition {
  const o = obj(v, path);
  const kind = str(o, "kind", path);
  if (!DEFINITION_KINDS.includes(kind as DefinitionKind)) {
    fail(`${path}.kind`, `one of ${DEFINITION_KINDS.join(", ")}`);
  }
  const label = optStr(o, "label", path);
  const note = optStr(o, "note", path);
  return {
    id: nonEmpty(o, "id", path),
    termId: nonEmpty(o, "termId", path),
    kind: kind as DefinitionKind,
    ...(label !== undefined ? { label } : {}),
    docId: nonEmpty(o, "docId", path),
    page: int(o, "page", path, 1),
    rects: arr(o.rects, `${path}.rects`).map((r, i) => rect(r, `${path}.rects[${i}]`)),
    text: str(o, "text", path),
    cropId: nonEmpty(o, "cropId", path),
    ...(note !== undefined ? { note } : {}),
    createdAt: num(o, "createdAt", path),
  };
}

function crop(v: unknown, path: string): ExportCrop {
  const o = obj(v, path);
  const dataUrl = str(o, "dataUrl", path);
  if (!dataUrl.startsWith("data:image/")) fail(`${path}.dataUrl`, "an image data URL");
  return {
    id: nonEmpty(o, "id", path),
    dataUrl,
    width: num(o, "width", path),
    height: num(o, "height", path),
  };
}

function suppression(v: unknown, path: string): Suppression {
  const o = obj(v, path);
  return {
    id: nonEmpty(o, "id", path),
    termId: nonEmpty(o, "termId", path),
    docId: nonEmpty(o, "docId", path),
    page: int(o, "page", path, 1),
    offset: int(o, "offset", path, 0),
  };
}

function list<T extends { id: string }>(
  root: Obj,
  key: string,
  parse: (v: unknown, path: string) => T,
): T[] {
  const items = arr(root[key], key).map((v, i) => parse(v, `${key}[${i}]`));
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) fail(`${key}[${i}].id`, `a unique id ("${item.id}" is repeated)`);
    seen.add(item.id);
  });
  return items;
}

/**
 * Validates parsed JSON as an export file (PLAN.md §8), including references between records.
 * Returns a clean copy without unknown fields, or the first problem found.
 */
export function validateExportFile(json: unknown): ValidationResult {
  try {
    const root = obj(json, "file");
    if (root.format !== "deflink") fail("format", `"deflink"`);
    if (root.version !== 1) fail("version", "1 (other versions are not supported)");
    const file: ExportFileV1 = {
      format: "deflink",
      version: 1,
      exportedAt: str(root, "exportedAt", "file"),
      documents: list(root, "documents", documentRecord),
      terms: list(root, "terms", term),
      definitions: list(root, "definitions", definition),
      crops: list(root, "crops", crop),
      suppressions: list(root, "suppressions", suppression),
    };
    const termIds = new Set(file.terms.map((t) => t.id));
    const cropIds = new Set(file.crops.map((c) => c.id));
    file.definitions.forEach((d, i) => {
      if (!termIds.has(d.termId)) fail(`definitions[${i}].termId`, "a term in the file");
      if (!cropIds.has(d.cropId)) fail(`definitions[${i}].cropId`, "a crop in the file");
    });
    file.suppressions.forEach((s, i) => {
      if (!termIds.has(s.termId)) fail(`suppressions[${i}].termId`, "a term in the file");
    });
    return { ok: true, file };
  } catch (err) {
    if (err instanceof InvalidFile) return { ok: false, error: err.message };
    throw err;
  }
}

/** What is already stored, as far as import needs to know. */
export interface ExistingStore {
  terms: readonly Term[];
  documentIds: ReadonlySet<string>;
  definitionIds: ReadonlySet<string>;
  cropIds: ReadonlySet<string>;
  suppressions: readonly Suppression[];
}

export interface ImportCounts {
  documents: number;
  terms: number;
  definitions: number;
  crops: number;
  suppressions: number;
}

export interface ImportPlan<C> {
  /** Records to write (put), including existing terms that gained aliases from merges. */
  documents: DocumentRecord[];
  terms: Term[];
  definitions: Definition[];
  crops: C[];
  suppressions: Suppression[];
  /** New records, records replaced by id (with overwrite), and records skipped. */
  added: ImportCounts;
  replaced: ImportCounts;
  skipped: ImportCounts;
  /** Imported terms merged into an existing term with the same surface form. */
  merged: { from: string; into: string }[];
}

const zero = (): ImportCounts => ({
  documents: 0,
  terms: 0,
  definitions: 0,
  crops: 0,
  suppressions: 0,
});

/**
 * Decides what an import writes (PLAN.md §8). Records whose id already exists are skipped unless
 * `overwrite` is set. An imported term that collides on a surface form with a term in the same
 * scope (decision 8) is merged into it, and its definitions and suppressions are moved there.
 * Suppressions that duplicate an existing one after that remapping are skipped.
 */
export function planImport<C extends { id: string }>(
  existing: ExistingStore,
  file: Omit<ExportFileV1, "crops"> & { crops: C[] },
  options: { overwrite: boolean; now: number },
): ImportPlan<C> {
  const { overwrite, now } = options;
  const added = zero();
  const replaced = zero();
  const skipped = zero();

  /** Sorts a record into added / replaced / skipped by whether its id already exists. */
  const take = <T>(key: keyof ImportCounts, exists: boolean, record: T, out: T[]) => {
    if (exists && !overwrite) {
      skipped[key]++;
      return false;
    }
    (exists ? replaced : added)[key]++;
    out.push(record);
    return true;
  };

  const documents: DocumentRecord[] = [];
  for (const d of file.documents) take("documents", existing.documentIds.has(d.id), d, documents);

  const pool = new Map(existing.terms.map((t) => [t.id, t]));
  const existingTermIds = new Set(pool.keys());
  const changed = new Set<string>();
  const termIdMap = new Map<string, string>();
  const merged: ImportPlan<C>["merged"] = [];
  for (const t of file.terms) {
    const exists = existingTermIds.has(t.id);
    termIdMap.set(t.id, t.id);
    if (exists && !overwrite) {
      skipped.terms++;
      continue;
    }
    const collision = findCollision([...pool.values()], t, t.id);
    if (collision) {
      const result = mergeTermInto(collision, t, [...pool.values()], now);
      pool.set(collision.id, result.term);
      changed.add(collision.id);
      termIdMap.set(t.id, collision.id);
      merged.push({ from: t.label, into: collision.label });
      continue;
    }
    (exists ? replaced : added).terms++;
    pool.set(t.id, t);
    changed.add(t.id);
  }
  const terms = [...changed].map((id) => pool.get(id)!);
  const remap = (termId: string) => termIdMap.get(termId) ?? termId;

  const definitions: Definition[] = [];
  for (const d of file.definitions) {
    take(
      "definitions",
      existing.definitionIds.has(d.id),
      { ...d, termId: remap(d.termId) },
      definitions,
    );
  }

  const crops: C[] = [];
  for (const c of file.crops) take("crops", existing.cropIds.has(c.id), c, crops);

  const suppressions: Suppression[] = [];
  const existingSuppressionIds = new Set(existing.suppressions.map((s) => s.id));
  const keyOf = (s: Suppression) => `${s.termId}\u0000${s.docId}\u0000${s.page}\u0000${s.offset}`;
  const seen = new Set(existing.suppressions.map(keyOf));
  for (const s of file.suppressions) {
    const next = { ...s, termId: remap(s.termId) };
    const exists = existingSuppressionIds.has(s.id);
    if (!exists && seen.has(keyOf(next))) {
      skipped.suppressions++;
      continue;
    }
    if (take("suppressions", exists, next, suppressions)) seen.add(keyOf(next));
  }

  return { documents, terms, definitions, crops, suppressions, added, replaced, skipped, merged };
}
