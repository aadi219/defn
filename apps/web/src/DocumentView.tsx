import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { Crop, Definition, Term } from "@deflink/core";
import {
  CAPTURE_MESSAGES,
  captureSelection,
  type CapturedSelection,
  type CaptureResult,
} from "./features/markDefinition/captureSelection";
import { DefinitionRegions } from "./features/markDefinition/DefinitionRegions";
import {
  MarkDefinitionDialog,
  type MarkDefinitionValues,
  type SaveTarget,
} from "./features/markDefinition/MarkDefinitionDialog";
import { useToast } from "./features/toast/toast";
import { renderCrop, type CropImage } from "./pdf/crop";
import type { LoadedPdf } from "./pdf/loadDocument";
import { PdfViewer, type PdfViewerHandle } from "./pdf/PdfViewer";
import { usePageTexts } from "./pdf/usePageTexts";
import { useStore } from "./state/store";
import { saveNewDefinition, TermCollisionError } from "./store/repo";
import { shouldIgnoreShortcut } from "./util/keys";

interface Draft {
  selection: CapturedSelection;
  crop: Promise<CropImage>;
  cropUrl: string | null;
  saving: boolean;
  error: string | null;
}

interface Props {
  doc: LoadedPdf;
  toolbarStart: ReactNode;
}

/** An open document: the viewer plus the per-document features layered on it. */
export function DocumentView({ doc, toolbarStart }: Props) {
  const viewer = useRef<PdfViewerHandle>(null);
  const toast = useToast();
  const { terms, definitions, reload } = useStore();
  const [debugSegments, setDebugSegments] = useState(false);
  const { onTextLayer } = usePageTexts(debugSegments);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Open context menu, with the selection captured when it opened. */
  const [menu, setMenu] = useState<{ x: number; y: number; capture: CaptureResult } | null>(null);

  const definitionsByPage = useMemo(() => {
    const byPage = new Map<number, Definition[]>();
    for (const d of definitions) byPage.set(d.page, [...(byPage.get(d.page) ?? []), d]);
    return byPage;
  }, [definitions]);

  const renderOverlay = useCallback(
    (pageNumber: number, viewport: PageViewport) => {
      const defs = definitionsByPage.get(pageNumber);
      return defs ? <DefinitionRegions definitions={defs} viewport={viewport} /> : null;
    },
    [definitionsByPage],
  );

  const capture = useCallback(() => captureSelection((n) => viewer.current?.getViewport(n)), []);

  const startMark = useCallback(
    (result: CaptureResult) => {
      setMenu(null);
      if (!result.ok) {
        toast(CAPTURE_MESSAGES[result.reason]);
        return;
      }
      const { selection } = result;
      const crop = doc.pdf
        .getPage(selection.pageNumber)
        .then((p) => renderCrop(p, selection.rects));
      setDraft({ selection, crop, cropUrl: null, saving: false, error: null });
      crop.then(
        (image) => {
          const url = URL.createObjectURL(image.blob);
          setDraft((d) => {
            if (d?.crop === crop) return { ...d, cropUrl: url };
            URL.revokeObjectURL(url);
            return d;
          });
        },
        (err: unknown) => console.error("Crop failed", err),
      );
    },
    [doc.pdf, toast],
  );

  const closeDraft = useCallback(() => {
    setDraft((d) => {
      if (d?.cropUrl) URL.revokeObjectURL(d.cropUrl);
      return null;
    });
  }, []);

  const save = useCallback(
    async (values: MarkDefinitionValues, target: SaveTarget) => {
      if (!draft) return;
      setDraft((d) => (d ? { ...d, saving: true, error: null } : d));
      try {
        const image = await draft.crop;
        const now = Date.now();
        const crop: Crop<Blob> = {
          id: crypto.randomUUID(),
          blob: image.blob,
          // Display size at 100% zoom; the image has `scale` pixels per unit.
          width: image.width / image.scale,
          height: image.height / image.scale,
        };
        const newTerm: Term | undefined =
          target.type === "new"
            ? {
                id: crypto.randomUUID(),
                label: values.term,
                aliases: values.aliases,
                caseSensitive: values.caseSensitive,
                scope: values.scope,
                createdAt: now,
                updatedAt: now,
              }
            : undefined;
        await saveNewDefinition({
          term: newTerm ? { create: newTerm } : { existingId: (target as { term: Term }).term.id },
          definition: {
            id: crypto.randomUUID(),
            kind: values.kind,
            ...(values.label ? { label: values.label } : {}),
            docId: doc.docId,
            page: draft.selection.pageNumber,
            rects: draft.selection.rects,
            text: draft.selection.text,
            createdAt: now,
          },
          crop,
        });
        await reload();
        window.getSelection()?.removeAllRanges();
        closeDraft();
        const termLabel = newTerm?.label ?? (target as { term: Term }).term.label;
        toast(`Saved definition of “${termLabel}”.`);
      } catch (err) {
        console.error(err);
        const message =
          err instanceof TermCollisionError
            ? `“${err.existing.label}” was just added in this scope. Choose another term.`
            : `Could not save: ${String(err)}`;
        setDraft((d) => (d ? { ...d, saving: false, error: message } : d));
        if (err instanceof TermCollisionError) await reload();
      }
    },
    [draft, doc.docId, reload, closeDraft, toast],
  );

  // D marks the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft || shouldIgnoreShortcut(e)) return;
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        startMark(capture());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, startMark, capture]);

  // Context menu: offer "Mark as definition" when right-clicking a text selection.
  const onContextMenu = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    const inText = (e.target as Element).closest?.(".textLayer");
    if (!inText || !sel || sel.isCollapsed) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, capture: capture() });
  };
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest(".context-menu")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return (
    <div className="document-view" onContextMenu={onContextMenu}>
      <PdfViewer
        ref={viewer}
        pdf={doc.pdf}
        onTextLayer={onTextLayer}
        renderOverlay={renderOverlay}
        toolbarStart={
          <>
            {toolbarStart}
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
      {menu && (
        <ul className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          <li role="none">
            <button type="button" role="menuitem" autoFocus onClick={() => startMark(menu.capture)}>
              Mark as definition <kbd>D</kbd>
            </button>
          </li>
        </ul>
      )}
      {draft && (
        <MarkDefinitionDialog
          docId={doc.docId}
          text={draft.selection.text}
          cropUrl={draft.cropUrl}
          terms={terms}
          saving={draft.saving}
          error={draft.error}
          onSave={(values, target) => void save(values, target)}
          onCancel={closeDraft}
        />
      )}
    </div>
  );
}
