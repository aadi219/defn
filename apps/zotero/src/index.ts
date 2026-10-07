import type { Definition, Term } from "@defn/core";
import { highlightJSON } from "./annotations";
import { cropFromCanvas } from "./crop";
import { h } from "./dom";
import { ReaderLinker } from "./linker";
import { openMarkDialog, type MarkTarget, type MarkValues } from "./markDialog";
import { connect, toPdfRect } from "./readerBridge";
import { DefnStore, TermCollisionError, type StoreIO } from "./store";

/**
 * Defn for Zotero (PLAN.md §M9). Bundled by scripts/build.ts as an IIFE assigned to `Defn`
 * and loaded into the bootstrap scope by addon/bootstrap.js.
 */

// The bootstrap sandbox has no window, so timers come from Firefox's Timer module.
const timers = ChromeUtils.importESModule<{
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}>("resource://gre/modules/Timer.sys.mjs");
const g = globalThis as { setTimeout?: unknown; clearTimeout?: unknown };
g.setTimeout ??= timers.setTimeout;
g.clearTimeout ??= timers.clearTimeout;

const geckoIO: StoreIO = {
  readJSON: (path) => IOUtils.readJSON(path),
  writeJSON: async (path, value) => {
    await IOUtils.writeJSON(path, value, { tmpPath: `${path}.tmp` });
  },
  writeBytes: async (path, bytes) => {
    await IOUtils.write(path, bytes, { tmpPath: `${path}.tmp` });
  },
  readBytes: (path) => IOUtils.read(path),
  makeDirectory: (path) =>
    IOUtils.makeDirectory(path, { createAncestors: true, ignoreExisting: true }),
  remove: (path) => IOUtils.remove(path, { recursive: true, ignoreAbsent: true }),
  join: (...parts) => PathUtils.join(...parts),
};

let store: DefnStore | null = null;
/** One linker per open PDF reader; `null` while connecting or when linking is unavailable. */
const linkers = new Map<ZoteroReaderInstance, ReaderLinker | null>();

const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);

function log(message: string, err?: unknown) {
  Zotero.debug(`Defn: ${message}`);
  if (err) Zotero.logError(err);
}

/** Plain copy of a content-side object (reader params arrive through Xray wrappers). */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Opens the mark dialog at once; the reader bridge, crop and document record are only needed when
 * saving, and the modal dialog keeps the selected page in view until then.
 */
function markDefinition(
  reader: ZoteroReaderInstance,
  doc: Document,
  selection: ZoteroReaderAnnotation,
) {
  const s = store;
  const item = reader._item;
  if (!s || !item || !selection.position || !selection.text) return;
  const started = Date.now();
  const docId = item.key;
  const page = selection.position.pageIndex + 1;
  const rects = selection.position.rects.map(toPdfRect);
  const text = selection.text.replace(/\s+/g, " ").trim();

  const dialog = openMarkDialog({
    doc,
    docId,
    text,
    terms: () => s.terms,
    onSave: async (values: MarkValues, target: MarkTarget) => {
      const bridge = linkers.get(reader)?.bridge ?? (await connect(reader));
      const crop = bridge ? cropFromCanvas(bridge, page, rects) : null;
      if (bridge) {
        s.upsertDocument({
          id: docId,
          title: bridge.title,
          fileName: bridge.fileName,
          pageCount: bridge.pageCount(),
          hasTextLayer: true,
        });
      }
      const now = Date.now();
      const newTerm: Term | undefined =
        target.type === "new"
          ? {
              id: uuid(),
              label: values.term,
              aliases: values.aliases,
              caseSensitive: values.caseSensitive,
              scope: values.scope,
              createdAt: now,
              updatedAt: now,
            }
          : undefined;
      let definition: Definition;
      try {
        definition = await s.saveNewDefinition({
          term: newTerm ? { create: newTerm } : { existingId: (target as { term: Term }).term.id },
          definition: {
            id: uuid(),
            kind: values.kind,
            ...(values.label ? { label: values.label } : {}),
            docId,
            page,
            rects,
            text,
            createdAt: now,
          },
          // Without a rendered canvas the popover falls back to the definition text.
          crop: crop
            ? { id: uuid(), width: crop.width, height: crop.height, png: crop.png }
            : { id: uuid(), width: 0, height: 0, png: new Uint8Array() },
        });
      } catch (err) {
        if (err instanceof TermCollisionError) {
          throw new Error(`“${err.existing.label}” already exists in this scope.`, { cause: err });
        }
        throw err;
      }
      await mirrorAsHighlight(
        item,
        definition,
        newTerm ?? (target as { term: Term }).term,
        selection,
      );
    },
  });
  log(`mark dialog opened in ${Date.now() - started} ms`);
  return dialog;
}

/** Saves a Zotero highlight for the definition; failures are logged, not fatal. */
async function mirrorAsHighlight(
  item: ZoteroItem,
  definition: Definition,
  term: Term,
  selection: ZoteroReaderAnnotation,
) {
  try {
    const key = Zotero.DataObjectUtilities.generateKey();
    await Zotero.Annotations.saveFromJSON(item, highlightJSON(key, definition, term, selection));
    store?.setAnnotationKey(definition.id, key);
  } catch (err) {
    log("could not mirror the definition as a highlight", err);
  }
}

/** Starts linking a reader once its PDF view is ready; degrades to "mark only" (§12) if not. */
async function attach(reader: ZoteroReaderInstance) {
  if (!store || reader.type !== "pdf" || linkers.has(reader)) return;
  for (const [r, linker] of linkers) {
    if (linker && !linker.alive) {
      linker.stop();
      linkers.delete(r);
    }
  }
  linkers.set(reader, null);
  const bridge = await connect(reader);
  if (!store || !linkers.has(reader)) return;
  if (!bridge) {
    log("linking unavailable for this reader (unexpected reader internals); marking still works");
    return;
  }
  store.upsertDocument({
    id: bridge.docId,
    title: bridge.title,
    fileName: bridge.fileName,
    pageCount: bridge.pageCount(),
    hasTextLayer: true,
  });
  const linker = new ReaderLinker(bridge, store);
  linkers.set(reader, linker);
  linker.start();
}

function onRenderToolbar(event: ZoteroReaderEvent) {
  attach(event.reader).catch((err: unknown) => log("could not attach to reader", err));
}

function onTextSelectionPopup(event: ZoteroReaderEvent) {
  const { reader, doc, params, append } = event;
  if (reader.type !== "pdf") return;
  const annotation = params.annotation ? plain(params.annotation) : undefined;
  if (!annotation?.position || !annotation.text) return;
  const button = h(
    doc,
    "button",
    {
      type: "button",
      className: "toolbar-button wide-button defn-mark",
      title: "Mark the selection as the definition of a term",
      onClick: () => {
        markDefinition(reader, doc, annotation)?.catch((err: unknown) =>
          log("marking failed", err),
        );
      },
    },
    "Mark as definition",
  );
  append(button);
}

export async function startup({ id }: { id: string; version: string; rootURI: string }) {
  store = new DefnStore(geckoIO, PathUtils.join(Zotero.DataDirectory.dir, "defn"));
  await store.load();
  Zotero.Reader.registerEventListener("renderTextSelectionPopup", onTextSelectionPopup, id);
  // Fires as each reader renders its toolbar, i.e. for every newly opened reader.
  Zotero.Reader.registerEventListener("renderToolbar", onRenderToolbar, id);
  // onMainWindowLoad only runs for windows opened after startup.
  for (const win of Zotero.getMainWindows()) onMainWindowLoad(win);
  for (const reader of Zotero.Reader._readers ?? []) {
    attach(reader).catch((err: unknown) => log("could not attach to reader", err));
  }
  log("started");
}

const CLEAR_MENU_ID = "defn-clear-data";

/**
 * Deletes all Defn data after confirming: terms, definitions, crops, suppressions, and the
 * highlights mirroring definitions (looked up by key in every library).
 */
async function clearAllData(win: Window) {
  const s = store;
  if (!s) return;
  const keys = s.annotationKeys();
  const highlights = keys.length === 1 ? "1 highlight" : `${keys.length} highlights`;
  const confirmed = Services.prompt.confirm(
    win,
    "Defn",
    `Delete all Defn terms and definitions, and the ${highlights} Defn created? This can't be undone.`,
  );
  if (!confirmed) return;
  let failed = 0;
  for (const key of keys) {
    try {
      for (const { libraryID } of Zotero.Libraries.getAll()) {
        const annotation = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key);
        if (annotation && annotation.isAnnotation()) {
          await annotation.eraseTx();
          break;
        }
      }
    } catch (err) {
      failed++;
      log(`could not delete highlight ${key}`, err);
    }
  }
  await s.clear();
  log("cleared all data");
  if (failed) {
    Services.prompt.alert(
      win,
      "Defn",
      `All data was cleared, but ${failed} of ${highlights} could not be deleted.`,
    );
  }
}

/** Adds "Clear All Data…" to the main window's Tools menu. */
export function onMainWindowLoad(win: Window) {
  const doc = win.document;
  const popup = doc.getElementById("menu_ToolsPopup");
  if (!popup || doc.getElementById(CLEAR_MENU_ID)) return;
  const item = doc.createXULElement("menuitem");
  item.id = CLEAR_MENU_ID;
  item.setAttribute("label", "Defn: Clear All Data…");
  item.addEventListener("command", () => {
    clearAllData(win).catch((err: unknown) => log("could not clear data", err));
  });
  popup.append(item);
}

export function onMainWindowUnload(win: Window) {
  win.document.getElementById(CLEAR_MENU_ID)?.remove();
}

export async function shutdown() {
  Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", onTextSelectionPopup);
  Zotero.Reader.unregisterEventListener("renderToolbar", onRenderToolbar);
  for (const win of Zotero.getMainWindows()) onMainWindowUnload(win);
  for (const linker of linkers.values()) linker?.stop();
  linkers.clear();
  await store?.flush();
  store = null;
}
