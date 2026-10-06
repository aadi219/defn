import {
  findCollision,
  type Crop,
  type Definition,
  type DocumentRecord,
  type Suppression,
  type Term,
} from "@defn/core";

/** On-disk layout of `defn/store.json` in the Zotero data directory (PLAN.md §M9). */
export interface StoreFile {
  format: "defn-zotero";
  version: 1;
  documents: DocumentRecord[];
  terms: Term[];
  definitions: Definition[];
  /** Crop metadata; the PNG lives at `crops/<id>.png`. */
  crops: Omit<Crop, "blob">[];
  suppressions: Suppression[];
  /** Zotero highlight annotation mirroring each definition, by definition id. */
  annotationKeys: Record<string, string>;
}

/** File operations the store needs; Gecko's IOUtils in Zotero, fakes in tests. */
export interface StoreIO {
  readJSON(path: string): Promise<unknown>;
  writeJSON(path: string, value: unknown): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  makeDirectory(path: string): Promise<void>;
  join(...parts: string[]): string;
}

const SAVE_DELAY_MS = 500;

export function emptyStore(): StoreFile {
  return {
    format: "defn-zotero",
    version: 1,
    documents: [],
    terms: [],
    definitions: [],
    crops: [],
    suppressions: [],
    annotationKeys: {},
  };
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/** Accepts a parsed store file, or returns null if it is not one (it is then left untouched). */
export function parseStoreFile(json: unknown): StoreFile | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  if (o.format !== "defn-zotero" || o.version !== 1) return null;
  const lists = ["documents", "terms", "definitions", "crops", "suppressions"] as const;
  if (!lists.every((k) => isArray(o[k]))) return null;
  const keys = o.annotationKeys;
  return {
    ...(o as unknown as StoreFile),
    annotationKeys:
      typeof keys === "object" && keys !== null ? (keys as Record<string, string>) : {},
  };
}

export class TermCollisionError extends Error {
  constructor(readonly existing: Term) {
    super(`A term "${existing.label}" already exists in this scope`);
  }
}

export interface NewDefinitionInput {
  term: { create: Term } | { existingId: string };
  definition: Omit<Definition, "termId" | "cropId">;
  crop: Omit<Crop, "blob"> & { png: Uint8Array };
}

/**
 * The plugin's store: everything in memory, persisted as one JSON file (debounced) plus one PNG per
 * crop. Listeners run after every change, e.g. to re-link open readers.
 */
export class DefnStore {
  private data: StoreFile = emptyStore();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly io: StoreIO,
    private readonly dir: string,
  ) {}

  private get file() {
    return this.io.join(this.dir, "store.json");
  }

  cropPath(cropId: string): string {
    return this.io.join(this.dir, "crops", `${cropId}.png`);
  }

  /**
   * Reads the store file. A missing file starts empty; an unreadable one also starts empty but is
   * never overwritten until something changes, so it can be recovered by hand.
   */
  async load(): Promise<void> {
    await this.io.makeDirectory(this.io.join(this.dir, "crops"));
    try {
      this.data = parseStoreFile(await this.io.readJSON(this.file)) ?? emptyStore();
    } catch {
      this.data = emptyStore();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
    for (const listener of this.listeners) listener();
  }

  /** Writes pending changes now (also called on shutdown). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      // JSON clone: the bootstrap sandbox may not provide structuredClone.
      const snapshot = JSON.parse(JSON.stringify(this.data)) as StoreFile;
      this.saving = this.saving.then(() => this.io.writeJSON(this.file, snapshot));
    }
    await this.saving;
  }

  /** All terms; a new array after every change to them. */
  get terms(): Term[] {
    return this.data.terms;
  }

  documentTitle(id: string): string | undefined {
    return this.document(id)?.title;
  }

  definitionsForDoc(docId: string): Definition[] {
    return this.data.definitions.filter((d) => d.docId === docId);
  }

  definitionsForTerm(termId: string): Definition[] {
    return this.data.definitions.filter((d) => d.termId === termId);
  }

  suppressionsForDoc(docId: string): Suppression[] {
    return this.data.suppressions.filter((s) => s.docId === docId);
  }

  document(id: string): DocumentRecord | undefined {
    return this.data.documents.find((d) => d.id === id);
  }

  crop(id: string): Omit<Crop, "blob"> | undefined {
    return this.data.crops.find((c) => c.id === id);
  }

  readCrop(id: string): Promise<Uint8Array> {
    return this.io.readBytes(this.cropPath(id));
  }

  upsertDocument(doc: Omit<DocumentRecord, "lastOpenedAt">): void {
    const record: DocumentRecord = { ...doc, lastOpenedAt: Date.now() };
    const at = this.data.documents.findIndex((d) => d.id === doc.id);
    if (at === -1) this.data.documents.push(record);
    else this.data.documents[at] = record;
    this.changed();
  }

  /**
   * Adds a definition (creating its term if new) after writing its crop. Throws
   * TermCollisionError if a new term collides with one in its scope (PLAN.md §4.3).
   */
  async saveNewDefinition(input: NewDefinitionInput): Promise<Definition> {
    let termId: string;
    if ("create" in input.term) {
      const existing = findCollision(this.data.terms, input.term.create);
      if (existing) throw new TermCollisionError(existing);
      termId = input.term.create.id;
    } else {
      termId = input.term.existingId;
      if (!this.data.terms.some((t) => t.id === termId)) {
        throw new Error("That term no longer exists");
      }
    }
    const { png, ...crop } = input.crop;
    await this.io.writeBytes(this.cropPath(crop.id), png);
    // Arrays are replaced, not mutated, so identity-keyed caches (core's matcher cache) see changes.
    const now = Date.now();
    this.data.terms =
      "create" in input.term
        ? [...this.data.terms, input.term.create]
        : this.data.terms.map((t) => (t.id === termId ? { ...t, updatedAt: now } : t));
    const definition: Definition = { ...input.definition, termId, cropId: crop.id };
    this.data.crops = [...this.data.crops, crop];
    this.data.definitions = [...this.data.definitions, definition];
    this.changed();
    return definition;
  }

  setAnnotationKey(definitionId: string, key: string): void {
    this.data.annotationKeys[definitionId] = key;
    this.changed();
  }

  addSuppression(s: Suppression): void {
    this.data.suppressions = [...this.data.suppressions, s];
    this.changed();
  }
}
