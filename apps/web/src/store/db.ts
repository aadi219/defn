import Dexie, { type EntityTable } from "dexie";
import type { Crop, Definition, DocumentRecord, Suppression, Term } from "@deflink/core";
import type { PdfFileHandle } from "../pdf/fileAccess";

/** Where a document's file lives, for reopening it from the recent list (Chromium only). */
export interface FileHandleRecord {
  docId: string;
  handle: PdfFileHandle;
}

export class DefLinkDB extends Dexie {
  documents!: EntityTable<DocumentRecord, "id">;
  terms!: EntityTable<Term, "id">;
  definitions!: EntityTable<Definition, "id">;
  crops!: EntityTable<Crop<Blob>, "id">;
  suppressions!: EntityTable<Suppression, "id">;
  fileHandles!: EntityTable<FileHandleRecord, "docId">;

  constructor(name = "deflink") {
    super(name);
    this.version(1).stores({
      documents: "id, lastOpenedAt",
      terms: "id, label, scope.type, scope.docId, updatedAt",
      definitions: "id, termId, docId, [docId+page]",
      crops: "id",
      suppressions: "id, [docId+page], termId",
    });
    this.version(2).stores({ fileHandles: "docId" });
  }
}

export const db = new DefLinkDB();
