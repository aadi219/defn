import type { DocumentRecord } from "@deflink/core";
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
