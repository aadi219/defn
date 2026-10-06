import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  bestDefinition,
  suggestTerm,
  type Crop,
  type Definition,
  type Term,
  type TermSuggestion,
} from "@deflink/core";
import {
  CAPTURE_MESSAGES,
  captureSelection,
  type CapturedSelection,
  type CaptureResult,
} from "./features/markDefinition/captureSelection";
import { OccurrenceUnderlines } from "./features/linking/OccurrenceUnderlines";
import { orderOccurrences, stepOccurrence } from "./features/linking/occurrenceNav";
import type { Occurrence } from "./features/linking/occurrences";
import { useLinking } from "./features/linking/useLinking";
import { useDefinitionActions } from "./features/editDefinition/useDefinitionActions";
import { DefinitionRegions } from "./features/markDefinition/DefinitionRegions";
import { definitionsAt } from "./features/markDefinition/regionHit";
import {
  MarkDefinitionDialog,
  type MarkDefinitionValues,
  type SaveTarget,
} from "./features/markDefinition/MarkDefinitionDialog";
import { DefinitionPopover } from "./features/popover/DefinitionPopover";
import { useHoverPopover } from "./features/popover/useHoverPopover";
import { StackPanel } from "./features/stack/StackPanel";
import { move, pin, unpin } from "./features/stack/stackState";
import { usePanelPrefs, useStack } from "./features/stack/useStack";
import { useToast } from "./features/toast/toast";
import { cssRectToPdf, unionPdfRects } from "./pdf/coords";
import { renderCrop, type CropImage } from "./pdf/crop";
import type { LoadedPdf } from "./pdf/loadDocument";
import { PdfViewer, type PdfViewerHandle } from "./pdf/PdfViewer";
import { usePageTexts, type PageTextEntry } from "./pdf/usePageTexts";
import { useSettings } from "./state/settings";
import { useStore } from "./state/store";
import {
  addSuppression,
  listDefinitionsForTerm,
  saveNewDefinition,
  TermCollisionError,
} from "./store/repo";
import { shouldIgnoreShortcut } from "./util/keys";
import { onMenuKeyDown } from "./util/menuKeys";

interface Draft {
  selection: CapturedSelection;
  suggestion: TermSuggestion;
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
  const root = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { terms, definitions, suppressions, reload } = useStore();
  const { settings } = useSettings();
  const { showUnderlines } = settings;
  const [debugSegments, setDebugSegments] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Page text feeds linking; the ref breaks the cycle between the two hooks.
  const linkPageRef = useRef<((entry: PageTextEntry) => void) | null>(null);
  const onPageText = useCallback((entry: PageTextEntry) => linkPageRef.current?.(entry), []);
  const { onTextLayer, liveEntries, getEntry } = usePageTexts(debugSegments, onPageText);
  const {
    byPage: occurrencesByPage,
    linkPage,
    matcher,
  } = useLinking(
    {
      docId: doc.docId,
      terms,
      definitions,
      suppressions,
      inflection: settings.inflection,
      onlyAfterFirstDefinition: settings.onlyAfterFirstDefinition,
    },
    liveEntries,
  );
  useEffect(() => {
    linkPageRef.current = linkPage;
  }, [linkPage]);

  const termsById = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);

  /** Occurrences on a page, only if laid out at the page's current scale. */
  const getOccurrences = useCallback(
    (page: number) => {
      const linked = occurrencesByPage.get(page);
      const scale = viewer.current?.getViewport(page)?.scale;
      return linked && linked.scale === scale ? linked.occurrences : undefined;
    },
    [occurrencesByPage],
  );
  const {
    target: popover,
    open: openPopover,
    close: closePopover,
  } = useHoverPopover(root, getOccurrences);

  // ] / [ step through linked occurrences on rendered pages and open their popovers, so terms
  // can be looked up without a pointer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e) || (e.key !== "]" && e.key !== "[")) return;
      e.preventDefault();
      const byPage = [...occurrencesByPage.keys()].map((page): [number, readonly Occurrence[]] => [
        page,
        getOccurrences(page) ?? [],
      ]);
      const currentPage = viewer.current?.getCurrentPage() ?? 1;
      const next = stepOccurrence(
        orderOccurrences(byPage),
        popover,
        currentPage,
        e.key === "]" ? 1 : -1,
      );
      if (!next) {
        toast("No linked terms on the pages around here.");
        return;
      }
      const pageEl = root.current?.querySelector<HTMLElement>(
        `.page[data-page-number="${next.page}"]`,
      );
      const viewport = viewer.current?.getViewport(next.page);
      const scroller = viewer.current?.getScroller();
      if (!pageEl || !viewport || !scroller) return;
      const view = scroller.getBoundingClientRect();
      const top = pageEl.getBoundingClientRect().top + next.rect.top;
      if (top < view.top || top + next.rect.height > view.bottom) {
        viewer.current?.scrollToPdfRect(next.page, cssRectToPdf(next.rect, viewport));
      }
      openPopover({ ...next, pageEl, via: "keyboard" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [occurrencesByPage, getOccurrences, popover, openPopover, toast]);
  const popoverTerm = popover ? termsById.get(popover.occurrence.termId) : undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const definitionActions = useDefinitionActions({ terms, reload, toast });
  /**
   * Open context menu, with the selection captured when it opened (null without a selection) and
   * the saved definition regions under the pointer.
   */
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    capture: CaptureResult | null;
    regions: Definition[];
  } | null>(null);

  const definitionsByPage = useMemo(() => {
    const byPage = new Map<number, Definition[]>();
    for (const d of definitions) byPage.set(d.page, [...(byPage.get(d.page) ?? []), d]);
    return byPage;
  }, [definitions]);

  const renderOverlay = useCallback(
    (pageNumber: number, viewport: PageViewport) => {
      const defs = definitionsByPage.get(pageNumber);
      const linked = occurrencesByPage.get(pageNumber);
      return (
        <>
          {defs && <DefinitionRegions definitions={defs} viewport={viewport} flashId={flash} />}
          {showUnderlines && linked && linked.scale === viewport.scale && (
            <OccurrenceUnderlines occurrences={linked.occurrences} />
          )}
        </>
      );
    },
    [definitionsByPage, occurrencesByPage, flash, showUnderlines],
  );

  const goToSource = useCallback(
    (definition: Definition) => {
      const rect = unionPdfRects(definition.rects);
      if (!rect) return;
      closePopover();
      viewer.current?.scrollToPdfRect(definition.page, rect);
      setFlash(definition.id);
    },
    [closePopover],
  );
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  const suppressPopoverOccurrence = useCallback(async () => {
    if (!popover) return;
    closePopover();
    try {
      await addSuppression({
        termId: popover.occurrence.termId,
        docId: doc.docId,
        page: popover.page,
        offset: popover.occurrence.start,
      });
      await reload();
      toast("This occurrence will no longer be linked.");
    } catch (err) {
      console.error(err);
      toast(`Could not save: ${String(err)}`);
    }
  }, [popover, closePopover, doc.docId, reload, toast]);

  const [stack, setStack] = useStack(doc.docId);
  const [panel, setPanel] = usePanelPrefs();
  const [stackFocus, setStackFocus] = useState<{ id: string; seq: number } | null>(null);

  /** Scrolls to and highlights a pinned card. */
  const showCard = useCallback(
    (id: string) => setStackFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 })),
    [],
  );

  /** Pins a term's best definition (decision 6), below `after` if given, and shows it. */
  const pinTerm = useCallback(
    async (termId: string, after?: string) => {
      const best = bestDefinition(await listDefinitionsForTerm(termId), doc.docId);
      if (!best) {
        toast("This term has no definitions.");
        return;
      }
      setStack((s) => pin(s, best.id, after));
      setPanel((p) => (p.open ? p : { ...p, open: true }));
      showCard(best.id);
    },
    [doc.docId, setStack, setPanel, showCard, toast],
  );

  const reportPinError = useCallback(
    (err: unknown) => {
      console.error(err);
      toast(`Could not pin: ${String(err)}`);
    },
    [toast],
  );

  const pinPopoverTerm = useCallback(() => {
    if (!popover) return;
    closePopover();
    pinTerm(popover.occurrence.termId).catch(reportPinError);
  }, [popover, closePopover, pinTerm, reportPinError]);

  // Popover shortcuts: G goes to the source in this document, P pins.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        pinPopoverTerm();
      } else if (key === "g") {
        const termId = popover.occurrence.termId;
        const first = bestDefinition(
          definitions.filter((d) => d.termId === termId),
          doc.docId,
        );
        if (first) {
          e.preventDefault();
          goToSource(first);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popover, definitions, doc.docId, goToSource, pinPopoverTerm]);

  const capture = useCallback(
    () => captureSelection((n) => viewer.current?.getViewport(n), getEntry),
    [getEntry],
  );

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
      const suggestion = suggestTerm(selection.text, selection.runs);
      setDraft({ selection, suggestion, crop, cropUrl: null, saving: false, error: null });
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

  // Context menu: "Mark as definition" on a text selection, Edit / Delete on a saved region.
  const onContextMenu = (e: React.MouseEvent) => {
    const target = e.target as Element;
    const sel = window.getSelection();
    const hasSelection = !!target.closest?.(".textLayer") && !!sel && !sel.isCollapsed;
    const pageEl = target.closest?.<HTMLElement>(".page");
    const pageNumber = Number(pageEl?.dataset.pageNumber);
    const viewport = pageEl ? viewer.current?.getViewport(pageNumber) : undefined;
    let regions: Definition[] = [];
    if (pageEl && viewport) {
      const box = pageEl.getBoundingClientRect();
      const onPage = definitionsByPage.get(pageNumber) ?? [];
      regions = definitionsAt(onPage, viewport, e.clientX - box.left, e.clientY - box.top);
    }
    if (!hasSelection && regions.length === 0) return;
    e.preventDefault();
    closePopover();
    setMenu({ x: e.clientX, y: e.clientY, capture: hasSelection ? capture() : null, regions });
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
    <div
      className="document-view"
      ref={root}
      onContextMenu={onContextMenu}
      style={{ "--link-underline": settings.underlineColor } as CSSProperties}
    >
      <div className="document-body">
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
          toolbarEnd={
            <button
              type="button"
              aria-pressed={panel.open}
              onClick={() => setPanel((p) => ({ ...p, open: !p.open }))}
            >
              Pinned ({stack.ids.length})
            </button>
          }
        />
        {panel.open && (
          <StackPanel
            stack={stack}
            docId={doc.docId}
            termsById={termsById}
            matcher={matcher}
            refreshKey={definitions}
            width={panel.width}
            focus={stackFocus}
            onWidth={(width) => setPanel((p) => ({ ...p, width }))}
            onClose={() => setPanel((p) => ({ ...p, open: false }))}
            onUnpin={(id) => setStack((s) => unpin(s, id))}
            onMove={(id, delta) => setStack((s) => move(s, id, delta))}
            onMissing={(ids) => setStack((s) => ids.reduce(unpin, s))}
            onGoToSource={goToSource}
            onPinTerm={(termId, after) => void pinTerm(termId, after).catch(reportPinError)}
            onShow={showCard}
            onEdit={definitionActions.startEdit}
            onDelete={definitionActions.startDelete}
          />
        )}
      </div>
      {popover && popoverTerm && (
        <DefinitionPopover
          term={popoverTerm}
          docId={doc.docId}
          anchor={popover}
          takeFocus={popover.via !== "hover"}
          onGoToSource={goToSource}
          onPin={pinPopoverTerm}
          onEdit={(d) => {
            closePopover();
            definitionActions.startEdit(d);
          }}
          onDelete={(d) => {
            closePopover();
            definitionActions.startDelete(d);
          }}
          onSuppress={() => void suppressPopoverOccurrence()}
        />
      )}
      {menu && (
        <ul
          className="context-menu"
          role="menu"
          aria-label="Definition actions"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={onMenuKeyDown}
        >
          {menu.capture && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => menu.capture && startMark(menu.capture)}
              >
                Mark as definition <kbd>D</kbd>
              </button>
            </li>
          )}
          {menu.regions.map((d, i) => {
            const label = termsById.get(d.termId)?.label ?? "definition";
            return (
              <Fragment key={d.id}>
                {(i > 0 || menu.capture) && <li role="separator" className="menu-separator" />}
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus={!menu.capture && i === 0}
                    onClick={() => {
                      setMenu(null);
                      definitionActions.startEdit(d);
                    }}
                  >
                    Edit definition of “{label}”
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      definitionActions.startDelete(d);
                    }}
                  >
                    Delete definition of “{label}”
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
      {definitionActions.dialogs}
      {draft && (
        <MarkDefinitionDialog
          docId={doc.docId}
          text={draft.selection.text}
          initialTerm={draft.suggestion.term}
          suggestionConfidence={draft.suggestion.term ? draft.suggestion.confidence : undefined}
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
