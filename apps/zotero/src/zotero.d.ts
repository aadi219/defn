/**
 * Minimal declarations for the Zotero / Firefox globals Defn uses, checked against the
 * zotero/zotero and zotero/reader sources for Zotero 8–9 (see docs/DECISIONS.md, M9). Reader
 * internals are typed as optional and only touched in readerBridge.ts.
 */

/** A Zotero item (attachment or annotation). */
interface ZoteroItem {
  id: number;
  key: string;
  parentItem?: ZoteroItem | false;
  getField(field: string): string;
  isPDFAttachment?(): boolean;
  isAnnotation(): boolean;
  eraseTx(): Promise<void>;
}

/** An annotation from the reader, as in `params.annotation` of `renderTextSelectionPopup`. */
interface ZoteroReaderAnnotation {
  text?: string;
  pageLabel?: string;
  sortIndex?: string;
  position?: { pageIndex: number; rects: number[][] };
}

interface ZoteroReaderEvent {
  reader: ZoteroReaderInstance;
  doc: Document;
  params: { annotation?: ZoteroReaderAnnotation } & Record<string, unknown>;
  append(...nodes: Node[]): void;
}

/** `ReaderTab` / `ReaderWindow` (chrome/content/zotero/xpcom/reader.js). */
interface ZoteroReaderInstance {
  readonly type: "pdf" | "epub" | "snapshot" | string;
  readonly itemID: number | undefined;
  _item?: ZoteroItem;
  _iframeWindow?: Window;
  _internalReader?: { _primaryView?: { _iframeWindow?: Window } };
  _waitForReader?(): Promise<void>;
  _initPromise?: Promise<void>;
  navigate(location: unknown): Promise<void>;
}

interface ZoteroGlobal {
  initializationPromise: Promise<void>;
  DataDirectory: { dir: string };
  Reader: {
    _readers: ZoteroReaderInstance[];
    registerEventListener(
      type: string,
      handler: (event: ZoteroReaderEvent) => void,
      pluginID?: string,
    ): void;
    unregisterEventListener(type: string, handler: (event: ZoteroReaderEvent) => void): void;
  };
  Annotations: {
    saveFromJSON(
      attachment: ZoteroItem,
      json: Record<string, unknown>,
      saveOptions?: Record<string, unknown>,
    ): Promise<ZoteroItem>;
  };
  DataObjectUtilities: { generateKey(): string };
  Libraries: { getAll(): { libraryID: number }[] };
  Items: {
    getByLibraryAndKeyAsync(libraryID: number, key: string): Promise<ZoteroItem | false>;
  };
  getMainWindows(): Window[];
  debug(message: string): void;
  logError(error: unknown): void;
}

declare const Zotero: ZoteroGlobal;

/** Gecko file I/O (available in privileged scopes). */
declare const IOUtils: {
  read(path: string): Promise<Uint8Array>;
  readJSON(path: string): Promise<unknown>;
  write(path: string, data: Uint8Array, options?: { tmpPath?: string }): Promise<number>;
  writeJSON(path: string, value: unknown, options?: { tmpPath?: string }): Promise<number>;
  makeDirectory(
    path: string,
    options?: { createAncestors?: boolean; ignoreExisting?: boolean },
  ): Promise<void>;
  remove(path: string, options?: { ignoreAbsent?: boolean; recursive?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
};

declare const PathUtils: {
  join(...parts: string[]): string;
};

declare const Services: {
  uuid: { generateUUID(): { toString(): string } };
  prompt: {
    confirm(parent: Window | null, title: string, text: string): boolean;
    alert(parent: Window | null, title: string, text: string): void;
  };
};

/** XPConnect; available in the plugin's system-principal sandbox. */
declare const Components: {
  utils: {
    /** Returns an Xray for an Xray-waived object (other objects are returned as they are). */
    unwaiveXrays<T>(object: T): T;
  };
};

interface Document {
  /** XUL documents (the Zotero main window). */
  createXULElement(tag: string): Element;
}

declare const ChromeUtils: {
  importESModule<T = Record<string, unknown>>(url: string): T;
};
