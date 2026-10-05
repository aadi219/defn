import { forwardRef, useEffect, useLayoutEffect, useState, type PointerEvent } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  useMergeRefs,
} from "@floating-ui/react";
import {
  compareByPosition,
  type Definition,
  type DefinitionKind,
  type DocumentRecord,
  type Term,
} from "@deflink/core";
import type { PageCssRect } from "../../pdf/coords";
import { getDocuments, listDefinitionsForTerm } from "../../store/repo";
import { useCropUrl } from "./useCropUrl";

const MAX_WIDTH = 520;

export const KIND_LABELS: Record<DefinitionKind, string> = {
  definition: "Definition",
  theorem: "Theorem",
  lemma: "Lemma",
  proposition: "Proposition",
  corollary: "Corollary",
  notation: "Notation",
  other: "Other",
};

export interface PopoverAnchor {
  pageEl: HTMLElement;
  /** Page-relative CSS px of the hovered line fragment. */
  rect: PageCssRect;
}

interface Props {
  term: Term;
  docId: string;
  anchor: PopoverAnchor;
  onGoToSource(definition: Definition): void;
  /** Pins the term's best definition (decision 6). */
  onPin(): void;
  onEdit(definition: Definition): void;
  onDelete(definition: Definition): void;
  onSuppress(): void;
  onPointerEnter?(e: PointerEvent): void;
  onPointerLeave?(e: PointerEvent): void;
}

interface Loaded {
  current: Definition[];
  other: Definition[];
  documents: Map<string, DocumentRecord>;
}

/** Sorts a term's definitions: this document first (by page), then others (newest first). */
export function splitDefinitions(definitions: readonly Definition[], docId: string) {
  const current = definitions.filter((d) => d.docId === docId).sort(compareByPosition);
  const other = definitions
    .filter((d) => d.docId !== docId)
    .sort((a, b) => b.createdAt - a.createdAt);
  return { current, other };
}

/** Hover / click popover for a linked occurrence (PLAN.md §7.3). */
export const DefinitionPopover = forwardRef<HTMLDivElement, Props>(function DefinitionPopover(
  {
    term,
    docId,
    anchor,
    onGoToSource,
    onPin,
    onEdit,
    onDelete,
    onSuppress,
    onPointerEnter,
    onPointerLeave,
  },
  ref,
) {
  const [loaded, setLoaded] = useState<(Loaded & { termId: string }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const definitions = await listDefinitionsForTerm(term.id);
      const documents = await getDocuments(definitions.map((d) => d.docId));
      if (!cancelled)
        setLoaded({ termId: term.id, ...splitDefinitions(definitions, docId), documents });
    })().catch((err: unknown) => console.error("Failed to load definitions", err));
    return () => {
      cancelled = true;
    };
  }, [term.id, term.updatedAt, docId]);

  const { refs, floatingStyles } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, availableHeight)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    const { pageEl, rect } = anchor;
    refs.setPositionReference({
      getBoundingClientRect() {
        const page = pageEl.getBoundingClientRect();
        return new DOMRect(page.left + rect.left, page.top + rect.top, rect.width, rect.height);
      },
      contextElement: pageEl,
    });
  }, [anchor, refs]);

  const mergedRef = useMergeRefs([refs.setFloating, ref]);
  const data = loaded?.termId === term.id ? loaded : null;
  const primary = data?.current[0] ?? data?.other[0];

  return (
    <div
      ref={mergedRef}
      className="definition-popover"
      role="dialog"
      aria-label={`Definition of ${term.label}`}
      style={{ ...floatingStyles, maxWidth: MAX_WIDTH }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <header className="popover-header">
        <strong>{term.label}</strong>
        {primary && (
          <span className={`kind-badge kind-${primary.kind}`}>{KIND_LABELS[primary.kind]}</span>
        )}
        {primary?.label && <span className="def-label">{primary.label}</span>}
      </header>

      {!data && <p className="muted">Loading…</p>}
      {data && data.current.length === 0 && data.other.length === 0 && (
        <p className="muted">This term has no definitions.</p>
      )}
      {data?.current.map((d, i) => (
        <DefinitionCard
          key={d.id}
          definition={d}
          source="this document"
          showHeader={i > 0}
          onGoToSource={() => onGoToSource(d)}
          onEdit={() => onEdit(d)}
          onDelete={() => onDelete(d)}
        />
      ))}
      {data && data.other.length > 0 && (
        <OtherDefinitions
          definitions={data.other}
          documents={data.documents}
          openByDefault={data.current.length === 0}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      <div className="popover-actions">
        <button type="button" onClick={onPin} disabled={!primary}>
          Pin <kbd>P</kbd>
        </button>
        <button
          type="button"
          onClick={() => data?.current[0] && onGoToSource(data.current[0])}
          disabled={!data?.current[0]}
          title={data?.current[0] ? undefined : "The definition is in another document"}
        >
          Go to source <kbd>G</kbd>
        </button>
        <button type="button" onClick={onSuppress}>
          Don't link here
        </button>
      </div>
    </div>
  );
});

function OtherDefinitions(props: {
  definitions: Definition[];
  documents: Map<string, DocumentRecord>;
  openByDefault: boolean;
  onEdit(definition: Definition): void;
  onDelete(definition: Definition): void;
}) {
  const { definitions, documents, openByDefault, onEdit, onDelete } = props;
  return (
    <details className="other-definitions" open={openByDefault}>
      <summary>Other definitions ({definitions.length})</summary>
      {definitions.map((d) => (
        <DefinitionCard
          key={d.id}
          definition={d}
          source={documents.get(d.docId)?.title ?? "another document"}
          showHeader
          onEdit={() => onEdit(d)}
          onDelete={() => onDelete(d)}
        />
      ))}
    </details>
  );
}

function DefinitionCard(props: {
  definition: Definition;
  source: string;
  /** Show kind/label (the popover header already shows them for the first definition). */
  showHeader: boolean;
  onGoToSource?: () => void;
  onEdit(): void;
  onDelete(): void;
}) {
  const { definition: d, source, showHeader, onGoToSource, onEdit, onDelete } = props;
  const crop = useCropUrl(d.cropId);
  return (
    <section className="definition-card">
      {showHeader && (
        <div className="card-header">
          <span className={`kind-badge kind-${d.kind}`}>{KIND_LABELS[d.kind]}</span>
          {d.label && <span className="def-label">{d.label}</span>}
        </div>
      )}
      <div className="crop">
        {crop ? (
          <img src={crop.url} alt={d.text} style={{ width: crop.width, maxWidth: "100%" }} />
        ) : (
          <p className="muted">{d.text}</p>
        )}
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
        <DefinitionActions onEdit={onEdit} onDelete={onDelete} />
      </div>
    </section>
  );
}

/** Edit / Delete links shown on a definition's source line. */
export function DefinitionActions(props: { onEdit(): void; onDelete(): void }) {
  return (
    <span className="definition-actions">
      <button type="button" className="link-button" onClick={props.onEdit}>
        Edit
      </button>
      <button type="button" className="link-button danger-link" onClick={props.onDelete}>
        Delete
      </button>
    </span>
  );
}
