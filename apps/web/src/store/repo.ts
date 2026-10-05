import {
  findCollision,
  type Crop,
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
