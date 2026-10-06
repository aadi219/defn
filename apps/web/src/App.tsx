import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { DocumentView } from "./DocumentView";
import { DataMenu } from "./features/data/DataMenu";
import { GlossaryDialog } from "./features/glossary/GlossaryDialog";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { ShortcutsDialog } from "./features/settings/ShortcutsDialog";
import { RecentDocuments } from "./features/recent/RecentDocuments";
import { ToastProvider, useToast } from "./features/toast/toast";
import {
  canUseFileHandles,
  fileFromHandle,
  handleFromDrop,
  pickPdfWithHandle,
  type PdfFileHandle,
} from "./pdf/fileAccess";
import { detectTextLayer, isPdfFile, loadPdf, type LoadedPdf } from "./pdf/loadDocument";
import { SettingsProvider, useSettings } from "./state/settings";
import { StoreProvider } from "./state/store";
import { saveFileHandle, upsertDocument, type RecentDocument } from "./store/repo";
import { shouldIgnoreShortcut } from "./util/keys";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "error"; message: string };

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SettingsProvider>
  );
}

function Shell() {
  const [doc, setDoc] = useState<LoadedPdf | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [noTextLayer, setNoTextLayer] = useState(false);
  const [dialog, setDialog] = useState<"glossary" | "settings" | "shortcuts" | null>(null);
  const { settings, update } = useSettings();
  const toast = useToast();
  const handlesSupported = canUseFileHandles();
  /** Recent document the next file-input pick is meant to reopen, to warn on a mismatch. */
  const expectedDoc = useRef<RecentDocument["document"] | null>(null);

  // App-wide shortcuts: ? shows the shortcut list, U toggles underlines.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if (e.key === "?") {
        e.preventDefault();
        setDialog("shortcuts");
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        update({ showUnderlines: !settings.showUnderlines });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.showUnderlines, update]);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = useCallback(
    async (
      file: File,
      options: { handle?: PdfFileHandle | null; expected?: RecentDocument["document"] | null } = {},
    ) => {
      if (!isPdfFile(file)) {
        setLoad({ status: "error", message: `"${file.name}" is not a PDF.` });
        return;
      }
      setLoad({ status: "loading", fileName: file.name });
      try {
        const loaded = await loadPdf(file);
        const hasTextLayer = await detectTextLayer(loaded.pdf);
        await upsertDocument({
          id: loaded.docId,
          title: loaded.title,
          fileName: loaded.fileName,
          pageCount: loaded.pdf.numPages,
          hasTextLayer,
        });
        if (options.handle) {
          await saveFileHandle(loaded.docId, options.handle).catch((err: unknown) =>
            console.warn("Could not remember the file for the recent list", err),
          );
        }
        setDoc(loaded);
        setNoTextLayer(!hasTextLayer);
        setLoad({ status: "idle" });
        const { expected } = options;
        if (expected && expected.id !== loaded.docId) {
          toast(
            `This file's contents differ from “${expected.title}”, so it opened as a separate document.`,
          );
        }
      } catch (err) {
        console.error(err);
        setLoad({ status: "error", message: `Could not open "${file.name}": ${String(err)}` });
      }
    },
    [toast],
  );

  /** Opens a PDF chosen with the native picker (keeping its handle) or the file input. */
  const chooseFile = useCallback(
    (expected: RecentDocument["document"] | null = null) => {
      expectedDoc.current = expected;
      if (!handlesSupported) {
        fileInput.current?.click();
        return;
      }
      pickPdfWithHandle()
        .then((picked) => {
          if (picked) return openFile(picked.file, { handle: picked.handle, expected });
        })
        .catch((err: unknown) => {
          console.error(err);
          setLoad({ status: "error", message: `Could not open the file: ${String(err)}` });
        });
    },
    [handlesSupported, openFile],
  );

  const openRecent = useCallback(
    (recent: RecentDocument) => {
      const { document: expected, handle } = recent;
      if (!handlesSupported || !handle) {
        chooseFile(expected);
        return;
      }
      void fileFromHandle(handle).then((file) => {
        if (file) return openFile(file, { handle, expected });
        // A picker opened here could be blocked: the click's user activation may be used up.
        toast(`“${expected.fileName}” could not be reopened. Use Open PDF… to choose it again.`);
      });
    },
    [handlesSupported, chooseFile, openFile, toast],
  );

  // Release the previous document's worker resources when it is replaced.
  useEffect(() => () => void doc?.pdf.loadingTask.destroy(), [doc]);

  useEffect(() => {
    document.title = doc ? `${doc.title} — Defn` : "Defn";
  }, [doc]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const index = Math.max(0, files.findIndex(isPdfFile));
    const file = files[index];
    if (!file) return;
    // The handle must be requested during the drop event, before any await.
    const fileItems = Array.from(e.dataTransfer.items).filter((i) => i.kind === "file");
    const handle = handleFromDrop(fileItems[index]);
    void handle.then((h) => openFile(file, { handle: h }));
  };

  const openButton = (
    <button type="button" onClick={() => chooseFile()}>
      Open PDF…
    </button>
  );
  const appButtons = (
    <>
      <button type="button" onClick={() => setDialog("glossary")}>
        Glossary
      </button>
      <DataMenu />
      <button
        type="button"
        className="icon-button"
        onClick={() => setDialog("settings")}
        aria-label="Settings"
        title="Settings"
      >
        ⚙
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={() => setDialog("shortcuts")}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
    </>
  );

  return (
    <div
      className={`app${dragging ? " dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const expected = expectedDoc.current;
          expectedDoc.current = null;
          if (file) void openFile(file, { expected });
        }}
      />
      {load.status === "error" && (
        <div className="banner banner-error" role="alert">
          {load.message}
          <button type="button" onClick={() => setLoad({ status: "idle" })} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {doc && noTextLayer && (
        <div className="banner banner-warning" role="status">
          This PDF has no text layer (probably scanned). Run OCR, e.g. OCRmyPDF, to enable linking.
          <button type="button" onClick={() => setNoTextLayer(false)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {doc ? (
        <StoreProvider key={doc.docId} docId={doc.docId}>
          <DocumentView
            doc={doc}
            toolbarStart={
              <>
                {openButton}
                {appButtons}
                <span className="doc-title" title={doc.fileName}>
                  {doc.title}
                </span>
              </>
            }
          />
        </StoreProvider>
      ) : (
        <main className="start">
          <h1>Defn</h1>
          <p>Open a PDF to start marking definitions.</p>
          <div className="start-actions">
            {openButton}
            {appButtons}
          </div>
          <p className="hint">…or drop a PDF anywhere on this window.</p>
          <RecentDocuments handlesSupported={handlesSupported} onOpen={openRecent} />
        </main>
      )}
      {load.status === "loading" && (
        <div className="loading-overlay" role="status">
          Opening {load.fileName}…
        </div>
      )}
      {dragging && <div className="drop-overlay">Drop PDF to open</div>}
      {dialog === "glossary" && (
        <GlossaryDialog currentDocId={doc?.docId} onClose={() => setDialog(null)} />
      )}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
