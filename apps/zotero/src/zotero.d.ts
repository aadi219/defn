/**
 * Minimal declarations for the Zotero / Firefox globals DefLink uses, checked against the
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
  remove(path: string, options?: { ignoreAbsent?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
};

declare const PathUtils: {
  join(...parts: string[]): string;
};

declare const Services: {
  uuid: { generateUUID(): { toString(): string } };
};

declare const ChromeUtils: {
  importESModule<T = Record<string, unknown>>(url: string): T;
};
