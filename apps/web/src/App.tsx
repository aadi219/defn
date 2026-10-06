import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { DocumentView } from "./DocumentView";
import { DataMenu } from "./features/data/DataMenu";
import { GlossaryDialog } from "./features/glossary/GlossaryDialog";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { ShortcutsDialog } from "./features/settings/ShortcutsDialog";
import { ToastProvider } from "./features/toast/toast";
import { detectTextLayer, isPdfFile, loadPdf, type LoadedPdf } from "./pdf/loadDocument";
import { SettingsProvider, useSettings } from "./state/settings";
import { StoreProvider } from "./state/store";
import { upsertDocument } from "./store/repo";
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

  const openFile = useCallback(async (file: File) => {
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
      setDoc(loaded);
      setNoTextLayer(!hasTextLayer);
      setLoad({ status: "idle" });
    } catch (err) {
      console.error(err);
      setLoad({ status: "error", message: `Could not open "${file.name}": ${String(err)}` });
    }
  }, []);

  // Release the previous document's worker resources when it is replaced.
  useEffect(() => () => void doc?.pdf.loadingTask.destroy(), [doc]);

  useEffect(() => {
    document.title = doc ? `${doc.title} — DefLink` : "DefLink";
  }, [doc]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find(isPdfFile) ?? e.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  const openButton = (
    <button type="button" onClick={() => fileInput.current?.click()}>
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
          if (file) void openFile(file);
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
          <h1>DefLink</h1>
          <p>Open a PDF to start marking definitions.</p>
          <div className="start-actions">
            {openButton}
            {appButtons}
          </div>
          <p className="hint">…or drop a PDF anywhere on this window.</p>
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
