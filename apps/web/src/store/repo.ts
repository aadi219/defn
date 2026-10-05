import {
  findCollision,
  planImport,
  type Crop,
  type ExportCrop,
  type ExportFileV1,
  type ImportPlan,
  type Definition,
  type DocumentRecord,
  type Suppression,
  type Term,
} from "@deflink/core";
import { db } from "./db";

/**
 * Inserts or refreshes a document record on open. `hasTextLayer` is kept from the stored record
 * when the caller doesn't know it yet.
 */
export async function upsertDocument(
  doc: Omit<DocumentRecord, "hasTextLayer" | "lastOpenedAt"> & { hasTextLayer?: boolean },
): Promise<DocumentRecord> {
  return db.transaction("rw", db.documents, async () => {
    const existing = await db.documents.get(doc.id);
    const record: DocumentRecord = {
      ...doc,
      hasTextLayer: doc.hasTextLayer ?? existing?.hasTextLayer ?? true,
      lastOpenedAt: Date.now(),
    };
    await db.documents.put(record);
    return record;
  });
}

export async function setDocumentHasTextLayer(id: string, hasTextLayer: boolean): Promise<void> {
  await db.documents.update(id, { hasTextLayer });
}

export function listTerms(): Promise<Term[]> {
  return db.terms.toArray();
}

export function listDefinitionsForDoc(docId: string): Promise<Definition[]> {
  return db.definitions.where("docId").equals(docId).toArray();
}

export function listDefinitionsForTerm(termId: string): Promise<Definition[]> {
  return db.definitions.where("termId").equals(termId).toArray();
}

/** Definitions by id; ids that no longer exist are absent from the map. */
export async function getDefinitions(ids: readonly string[]): Promise<Map<string, Definition>> {
  const defs = await db.definitions.bulkGet([...ids]);
  return new Map(defs.filter((d) => d !== undefined).map((d) => [d.id, d]));
}

export async function getDocuments(ids: readonly string[]): Promise<Map<string, DocumentRecord>> {
  const docs = await db.documents.bulkGet([...new Set(ids)]);
  return new Map(docs.filter((d) => d !== undefined).map((d) => [d.id, d]));
}

export function listSuppressionsForDoc(docId: string): Promise<Suppression[]> {
  return db.suppressions
    .where("[docId+page]")
    .between([docId, -Infinity], [docId, Infinity])
    .toArray();
}

/** "Don't link here" for one occurrence (PLAN.md §4.1 Suppression). */
export async function addSuppression(s: Omit<Suppression, "id">): Promise<Suppression> {
  const suppression: Suppression = { id: crypto.randomUUID(), ...s };
  await db.suppressions.add(suppression);
  return suppression;
}

export function getCrop(id: string): Promise<Crop<Blob> | undefined> {
  return db.crops.get(id);
}

export class TermCollisionError extends Error {
  constructor(readonly existing: Term) {
    super(`A term "${existing.label}" already exists in this scope`);
  }
}

export interface NewDefinitionInput {
  /** A new term to create, or the id of an existing term to add this definition to. */
  term: { create: Term } | { existingId: string };
  definition: Omit<Definition, "termId" | "cropId">;
  crop: Crop<Blob>;
}

/**
 * Writes the term (if new), the crop and the definition in one transaction (PLAN.md §6.2).
 * Throws TermCollisionError if a new term collides with an existing one in its scope.
 */
export async function saveNewDefinition(input: NewDefinitionInput): Promise<Definition> {
  return db.transaction("rw", db.terms, db.definitions, db.crops, async () => {
    let termId: string;
    if ("create" in input.term) {
      const term = input.term.create;
      const existing = findCollision(await db.terms.toArray(), term);
      if (existing) throw new TermCollisionError(existing);
      await db.terms.add(term);
      termId = term.id;
    } else {
      termId = input.term.existingId;
      const updated = await db.terms.update(termId, { updatedAt: Date.now() });
      if (!updated) throw new Error(`Term ${termId} no longer exists`);
    }
    await db.crops.add(input.crop);
    const definition: Definition = { ...input.definition, termId, cropId: input.crop.id };
    await db.definitions.add(definition);
    return definition;
  });
}

export interface DefinitionEdits {
  kind: Definition["kind"];
  /** Empty removes the label. */
  label: string;
}

export interface UpdateDefinitionInput {
  definitionId: string;
  definition: DefinitionEdits;
  /**
   * Updated fields for the definition's own term (they apply to all its definitions), or the id of
   * another term to move the definition to.
   */
  term:
    { update: Pick<Term, "label" | "aliases" | "caseSensitive" | "scope"> } | { moveTo: string };
}

/**
 * Edits a definition and its term in one transaction. Throws TermCollisionError if the updated term
 * would collide with another term in its scope. Moving a term's only definition elsewhere deletes
 * the emptied term and its suppressions; returns whether that happened.
 */
export async function updateDefinition(
  input: UpdateDefinitionInput,
): Promise<{ oldTermDeleted: boolean }> {
  return db.transaction("rw", [db.terms, db.definitions, db.suppressions], async () => {
    const definition = await db.definitions.get(input.definitionId);
    if (!definition) throw new Error("This definition no longer exists");
    const now = Date.now();
    let termId = definition.termId;
    let oldTermDeleted = false;
    if ("update" in input.term) {
      const term = await db.terms.get(termId);
      if (!term) throw new Error("This definition's term no longer exists");
      const updated: Term = { ...term, ...input.term.update, updatedAt: now };
      const existing = findCollision(await db.terms.toArray(), updated, term.id);
      if (existing) throw new TermCollisionError(existing);
      await db.terms.put(updated);
    } else {
      termId = input.term.moveTo;
      const moved = await db.terms.update(termId, { updatedAt: now });
      if (!moved) throw new Error("The target term no longer exists");
    }
    const next: Definition = { ...definition, termId, kind: input.definition.kind };
    if (input.definition.label) next.label = input.definition.label;
    else delete next.label;
    await db.definitions.put(next);
    if (termId !== definition.termId) {
      const old = definition.termId;
      if ((await db.definitions.where("termId").equals(old).count()) === 0) {
        await db.suppressions.where("termId").equals(old).delete();
        await db.terms.delete(old);
        oldTermDeleted = true;
      } else {
        await db.terms.update(old, { updatedAt: now });
      }
    }
    return { oldTermDeleted };
  });
}

/**
 * Deletes a definition and its crop. With `deleteTermIfLast`, also deletes its term (and the term's
 * suppressions) when no other definitions remain; otherwise the term is left orphaned (§4.3).
 * Returns whether the term was deleted.
 */
export async function deleteDefinition(
  id: string,
  options: { deleteTermIfLast: boolean },
): Promise<{ termDeleted: boolean }> {
  return db.transaction("rw", [db.terms, db.definitions, db.crops, db.suppressions], async () => {
    const definition = await db.definitions.get(id);
    if (!definition) return { termDeleted: false };
    await db.definitions.delete(id);
    await db.crops.delete(definition.cropId);
    const { termId } = definition;
    const remaining = await db.definitions.where("termId").equals(termId).count();
    if (!options.deleteTermIfLast || remaining > 0) {
      await db.terms.update(termId, { updatedAt: Date.now() });
      return { termDeleted: false };
    }
    await db.suppressions.where("termId").equals(termId).delete();
    await db.terms.delete(termId);
    return { termDeleted: true };
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read crop"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** The whole store as an export file (PLAN.md §8), crops as data URLs. */
export async function exportStore(): Promise<ExportFileV1> {
  const tables = [db.documents, db.terms, db.definitions, db.crops, db.suppressions];
  const [documents, terms, definitions, crops, suppressions] = await db.transaction(
    "r",
    tables,
    () =>
      Promise.all([
        db.documents.toArray(),
        db.terms.toArray(),
        db.definitions.toArray(),
        db.crops.toArray(),
        db.suppressions.toArray(),
      ]),
  );
  return {
    format: "deflink",
    version: 1,
    exportedAt: new Date().toISOString(),
    documents,
    terms,
    definitions,
    crops: await Promise.all(
      crops.map(async (c) => ({
        id: c.id,
        dataUrl: await blobToDataUrl(c.blob),
        width: c.width,
        height: c.height,
      })),
    ),
    suppressions,
  };
}

/**
 * Imports a validated export file (PLAN.md §8): see `planImport` for the conflict policy. Crops are
 * decoded before the write transaction, which then applies the whole plan at once.
 */
export async function importStore(
  file: ExportFileV1,
  options: { overwrite: boolean },
): Promise<ImportPlan<ExportCrop>> {
  const tables = [db.documents, db.terms, db.definitions, db.crops, db.suppressions];
  const existing = await db.transaction("r", tables, async () => ({
    terms: await db.terms.toArray(),
    documentIds: new Set(await db.documents.toCollection().primaryKeys()),
    definitionIds: new Set(await db.definitions.toCollection().primaryKeys()),
    cropIds: new Set(await db.crops.toCollection().primaryKeys()),
    suppressions: await db.suppressions.toArray(),
  }));
  const plan = planImport(existing, file, { overwrite: options.overwrite, now: Date.now() });
  const crops: Crop<Blob>[] = await Promise.all(
    plan.crops.map(async (c) => ({
      id: c.id,
      blob: await dataUrlToBlob(c.dataUrl),
      width: c.width,
      height: c.height,
    })),
  );
  await db.transaction("rw", tables, async () => {
    await db.documents.bulkPut(plan.documents);
    await db.terms.bulkPut(plan.terms);
    await db.crops.bulkPut(crops);
    await db.definitions.bulkPut(plan.definitions);
    await db.suppressions.bulkPut(plan.suppressions);
  });
  return plan;
}
