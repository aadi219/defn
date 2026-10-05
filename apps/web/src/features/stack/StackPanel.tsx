import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Definition, DocumentRecord, Term } from "@deflink/core";
import { getDefinitions, getDocuments } from "../../store/repo";
import { KIND_LABELS } from "../popover/DefinitionPopover";
import { useCropUrl } from "../popover/useCropUrl";
import type { StackState } from "./stackState";
import { clampPanelWidth } from "./useStack";

const RESIZE_KEY_STEP = 16;

interface Loaded {
  definitions: Map<string, Definition>;
  documents: Map<string, DocumentRecord>;
}

interface Props {
  stack: StackState;
  docId: string;
  termsById: ReadonlyMap<string, Term>;
  /** Changes whenever stored definitions may have changed, to reload the cards. */
  refreshKey: unknown;
  width: number;
  /** Card to scroll into view and highlight; `seq` re-triggers for the same id. */
  focus: { id: string; seq: number } | null;
  onWidth(width: number): void;
  onClose(): void;
  onUnpin(id: string): void;
  onMove(id: string, delta: number): void;
  /** Called with pinned ids whose definitions no longer exist, so they can be unpinned. */
  onMissing(ids: string[]): void;
  onGoToSource(definition: Definition): void;
}

/** Right-hand panel of pinned definitions (PLAN.md §7.4). */
export function StackPanel(props: Props) {
  const { stack, docId, termsById, refreshKey, width, focus } = props;
  const { onWidth, onClose, onUnpin, onMove, onMissing, onGoToSource } = props;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const onMissingRef = useRef(onMissing);
  useEffect(() => {
    onMissingRef.current = onMissing;
  }, [onMissing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const definitions = await getDefinitions(stack.ids);
      const documents = await getDocuments([...definitions.values()].map((d) => d.docId));
      if (cancelled) return;
      setLoaded({ definitions, documents });
      const missing = stack.ids.filter((id) => !definitions.has(id));
      if (missing.length) onMissingRef.current(missing);
    })().catch((err: unknown) => console.error("Failed to load pinned definitions", err));
    return () => {
      cancelled = true;
    };
  }, [stack.ids, refreshKey]);

  useEffect(() => {
    if (focus) cardRefs.current.get(focus.id)?.scrollIntoView({ block: "nearest" });
  }, [focus, loaded]);

  const resize = useResize(width, onWidth);
  const cards = stack.ids.flatMap((id) => {
    const d = loaded?.definitions.get(id);
    return d ? [d] : [];
  });

  return (
    <aside className="stack-panel" style={{ width }} aria-label="Pinned definitions">
      <div
        className="stack-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize pinned definitions panel"
        aria-valuenow={width}
        tabIndex={0}
        {...resize}
      />
      <header className="stack-header">
        <h2>Pinned</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </header>
      <div className="stack-cards">
        {stack.ids.length === 0 && (
          <p className="muted stack-empty">
            Pin a definition from its popover (<kbd>P</kbd>) to keep it here while you read.
          </p>
        )}
        {cards.map((d, i) => (
          <StackCard
            key={d.id}
            cardRef={(el) => {
              if (el) cardRefs.current.set(d.id, el);
              else cardRefs.current.delete(d.id);
            }}
            definition={d}
            term={termsById.get(d.termId)}
            source={
              d.docId === docId
                ? "this document"
                : (loaded?.documents.get(d.docId)?.title ?? "another document")
            }
            highlighted={focus?.id === d.id}
            highlightSeq={focus?.seq ?? 0}
            isFirst={i === 0}
            isLast={i === cards.length - 1}
            onUnpin={() => onUnpin(d.id)}
            onMove={(delta) => onMove(d.id, delta)}
            onGoToSource={d.docId === docId ? () => onGoToSource(d) : undefined}
          />
        ))}
      </div>
    </aside>
  );
}

function StackCard(props: {
  cardRef: (el: HTMLElement | null) => void;
  definition: Definition;
  term: Term | undefined;
  source: string;
  highlighted: boolean;
  highlightSeq: number;
  isFirst: boolean;
  isLast: boolean;
  onUnpin(): void;
  onMove(delta: number): void;
  onGoToSource?: () => void;
}) {
  const { cardRef, definition: d, term, source, highlighted, highlightSeq } = props;
  const { isFirst, isLast, onUnpin, onMove, onGoToSource } = props;
  const crop = useCropUrl(d.cropId);
  const label = term?.label ?? "Unknown term";
  return (
    <section
      ref={cardRef}
      // Re-keying the highlight restarts its animation when the same card is pinned again.
      key={highlighted ? `hl-${highlightSeq}` : undefined}
      className={`stack-card${highlighted ? " highlight" : ""}`}
      aria-label={`Pinned: ${label}`}
    >
      <header className="card-header">
        <strong className="stack-term">{label}</strong>
        <span className={`kind-badge kind-${d.kind}`}>{KIND_LABELS[d.kind]}</span>
        {d.label && <span className="def-label">{d.label}</span>}
        <span className="spacer" />
        <button
          type="button"
          className="icon-button"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          aria-label={`Move ${label} up`}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => onMove(1)}
          disabled={isLast}
          aria-label={`Move ${label} down`}
        >
          ↓
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onUnpin}
          aria-label={`Unpin ${label}`}
        >
          ✕
        </button>
      </header>
      <div className="crop">
        {crop ? <img src={crop.url} alt={d.text} /> : <p className="muted">{d.text}</p>}
      </div>
      <div className="source">
        {onGoToSource ? (
          <button type="button" className="link-button" onClick={onGoToSource}>
            {source}, p. {d.page}
          </button>
        ) : (
          <span>
            {source}, p. {d.page}
          </span>
        )}
      </div>
    </section>
  );
}

/** Pointer-drag and arrow-key handlers for the panel's left-edge resize handle. */
function useResize(width: number, onWidth: (width: number) => void) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { startX: e.clientX, startWidth: width };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!drag.current) return;
      // The handle is on the left edge, so dragging left widens the panel.
      onWidth(clampPanelWidth(drag.current.startWidth + drag.current.startX - e.clientX));
    },
    onPointerUp() {
      drag.current = null;
    },
    onPointerCancel() {
      drag.current = null;
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      const delta =
        e.key === "ArrowLeft" ? RESIZE_KEY_STEP : e.key === "ArrowRight" ? -RESIZE_KEY_STEP : 0;
      if (!delta) return;
      e.preventDefault();
      onWidth(clampPanelWidth(width + delta));
    },
  };
}
