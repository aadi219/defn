import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { detectTextLayer, isPdfFile, loadPdf, type LoadedPdf } from "./pdf/loadDocument";
import { PdfViewer } from "./pdf/PdfViewer";
import { usePageTexts } from "./pdf/usePageTexts";
import { upsertDocument } from "./store/repo";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "error"; message: string };

export function App() {
  const [doc, setDoc] = useState<LoadedPdf | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [noTextLayer, setNoTextLayer] = useState(false);
  const [debugSegments, setDebugSegments] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { onTextLayer } = usePageTexts(debugSegments);

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
        <PdfViewer
          key={doc.docId}
          pdf={doc.pdf}
          onTextLayer={onTextLayer}
          toolbarStart={
            <>
              {openButton}
              <span className="doc-title" title={doc.fileName}>
                {doc.title}
              </span>
              {import.meta.env.DEV && (
                <button
                  type="button"
                  aria-pressed={debugSegments}
                  onClick={() => setDebugSegments((on) => !on)}
                  title="Dev only: outline text-layer segments"
                >
                  Segments
                </button>
              )}
            </>
          }
        />
      ) : (
        <main className="start">
          <h1>DefLink</h1>
          <p>Open a PDF to start marking definitions.</p>
          {openButton}
          <p className="hint">…or drop a PDF anywhere on this window.</p>
        </main>
      )}
      {load.status === "loading" && (
        <div className="loading-overlay" role="status">
          Opening {load.fileName}…
        </div>
      )}
      {dragging && <div className="drop-overlay">Drop PDF to open</div>}
    </div>
  );
}
