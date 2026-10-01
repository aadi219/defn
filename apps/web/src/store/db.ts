import Dexie, { type EntityTable } from "dexie";
import type { Crop, Definition, DocumentRecord, Suppression, Term } from "@deflink/core";

export class DefLinkDB extends Dexie {
  documents!: EntityTable<DocumentRecord, "id">;
  terms!: EntityTable<Term, "id">;
  definitions!: EntityTable<Definition, "id">;
  crops!: EntityTable<Crop<Blob>, "id">;
  suppressions!: EntityTable<Suppression, "id">;

  constructor(name = "deflink") {
    super(name);
    this.version(1).stores({
      documents: "id, lastOpenedAt",
      terms: "id, label, scope.type, scope.docId, updatedAt",
      definitions: "id, termId, docId, [docId+page]",
      crops: "id",
      suppressions: "id, [docId+page], termId",
    });
  }
}

export const db = new DefLinkDB();
