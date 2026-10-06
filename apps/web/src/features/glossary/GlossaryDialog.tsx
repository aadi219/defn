import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Definition, DocumentRecord, Term } from "@deflink/core";
import { notifyStoreChanged } from "../../state/store";
import {
  deleteTerms,
  listAllDefinitions,
  listDocuments,
  listTerms,
  mergeTerms,
  TermCollisionError,
  updateTerm,
  type TermFields,
} from "../../store/repo";
import { buildRows, filterRows, sortRows, type SortKey } from "./glossaryRows";
import { ConfirmDialog, MergeDialog, TermEditDialog } from "./TermDialogs";

interface Data {
  terms: Term[];
  definitions: Definition[];
  documents: Map<string, DocumentRecord>;
}

type SubDialog =
  | { type: "edit"; term: Term; error: string | null }
  | { type: "merge"; term: Term }
  | { type: "delete"; ids: string[] };

async function loadData(): Promise<Data> {
  const [terms, definitions, documents] = await Promise.all([
    listTerms(),
    listAllDefinitions(),
    listDocuments(),
  ]);
  return { terms, definitions, documents: new Map(documents.map((d) => [d.id, d])) };
}

const SORT_LABELS: Record<SortKey, string> = {
  label: "Term",
  definitions: "Definitions",
  updated: "Last updated",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Searchable table of all terms with edit, merge and delete (PLAN.md §7.5). */
export function GlossaryDialog(props: { currentDocId?: string; onClose(): void }) {
  const { currentDocId, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [orphanedOnly, setOrphanedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "label",
    dir: "asc",
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sub, setSub] = useState<SubDialog | null>(null);
  const [busy, setBusy] = useState(false);
  /** Outcome of the last change; toasts would be hidden behind this modal. */
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadData();
    setData(next);
    const ids = new Set(next.terms.map((t) => t.id));
    setSelected((s) => new Set([...s].filter((x) => ids.has(x))));
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    let cancelled = false;
    loadData()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => console.error("Failed to load glossary", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => (data ? buildRows(data.terms, data.definitions, data.documents, currentDocId) : []),
    [data, currentDocId],
  );
  const visible = useMemo(
    () => sortRows(filterRows(rows, query, { orphanedOnly }), sort.key, sort.dir),
    [rows, query, orphanedOnly, sort],
  );
  const definitionCounts = useMemo(
    () => new Map(rows.map((r) => [r.term.id, r.definitionCount])),
    [rows],
  );
  const orphanCount = rows.filter((r) => r.definitionCount === 0).length;
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.term.id));

  /** Runs a change, then reloads the glossary and every open document's store. */
  const apply = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      const message = await work();
      setSub(null);
      setStatus(message);
    } catch (err) {
      if (err instanceof TermCollisionError && sub?.type === "edit") {
        setSub({ ...sub, error: `“${err.existing.label}” already uses one of these forms.` });
      } else {
        console.error(err);
        setSub(null);
        setStatus(`Something went wrong: ${String(err)}`);
      }
    } finally {
      setBusy(false);
      await refresh().catch((err: unknown) => console.error(err));
      notifyStoreChanged();
    }
  };

  const saveTerm = (term: Term, fields: TermFields) =>
    void apply(async () => {
      await updateTerm(term.id, fields);
      return `Saved “${fields.label}”.`;
    });

  const merge = (source: Term, targetId: string) =>
    void apply(async () => {
      const { dropped } = await mergeTerms(source.id, targetId);
      const target = data?.terms.find((t) => t.id === targetId);
      return (
        `Merged “${source.label}” into “${target?.label ?? "the term"}”.` +
        (dropped.length ? ` Not added: ${dropped.join(", ")}.` : "")
      );
    });

  const remove = (ids: string[]) =>
    void apply(async () => {
      await deleteTerms(ids);
      setSelected(new Set());
      return ids.length === 1 ? "Deleted 1 term." : `Deleted ${ids.length} terms.`;
    });

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const toggle = (termId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(termId)) next.add(termId);
      return next;
    });

  const deleting = sub?.type === "delete" ? sub.ids : [];
  const deletingDefs = deleting.reduce((n, termId) => n + (definitionCounts.get(termId) ?? 0), 0);

  return (
    <dialog
      ref={dialog}
      className="glossary-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!sub && !busy) onClose();
      }}
    >
      <header className="glossary-header">
        <h2 id={`${id}-title`}>Glossary</h2>
        <input
          type="search"
          className="glossary-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms, aliases and definition text"
          aria-label="Search glossary"
          autoFocus
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={orphanedOnly}
            onChange={(e) => setOrphanedOnly(e.target.checked)}
          />
          Orphaned only ({orphanCount})
        </label>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="glossary-bulk">
        <span className="glossary-status" role="status">
          {status}
        </span>
        {selected.size > 0 && (
          <>
            <span>{selected.size} selected</span>
            <button
              type="button"
              className="danger"
              onClick={() => setSub({ type: "delete", ids: [...selected] })}
            >
              Delete selected
            </button>
            <button type="button" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </>
        )}
      </div>

      <div className="glossary-table-wrap">
        {!data ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No terms yet. Select a definition in a PDF and press D.</p>
        ) : (
          <table className="glossary-table">
            <thead>
              <tr>
                <th scope="col" className="col-select">
                  <input
                    type="checkbox"
                    aria-label="Select all shown terms"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        for (const r of visible) {
                          if (allVisibleSelected) next.delete(r.term.id);
                          else next.add(r.term.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                <SortHeader k="label" sort={sort} onSort={toggleSort} />
                <th scope="col">Aliases</th>
                <th scope="col">Scope</th>
                <SortHeader k="definitions" sort={sort} onSort={toggleSort} numeric />
                <SortHeader k="updated" sort={sort} onSort={toggleSort} />
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No terms match.
                  </td>
                </tr>
              )}
              {visible.map(({ term, definitionCount, scopeLabel }) => (
                <tr key={term.id} aria-selected={selected.has(term.id)}>
                  <td className="col-select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${term.label}`}
                      checked={selected.has(term.id)}
                      onChange={() => toggle(term.id)}
                    />
                  </td>
                  <th scope="row">
                    {term.label}
                    {term.caseSensitive && (
                      <span className="tag" title="Case sensitive">
                        Aa
                      </span>
                    )}
                    {definitionCount === 0 && <span className="tag tag-warning">orphaned</span>}
                  </th>
                  <td className="aliases">{term.aliases.join(", ")}</td>
                  <td>{scopeLabel}</td>
                  <td className="numeric">{definitionCount}</td>
                  <td>{dateFormat.format(term.updatedAt)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setSub({ type: "edit", term, error: null })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setSub({ type: "merge", term })}
                      disabled={rows.length < 2}
                    >
                      Merge…
                    </button>
                    <button
                      type="button"
                      className="link-button danger-link"
                      onClick={() => setSub({ type: "delete", ids: [term.id] })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sub?.type === "edit" && data && (
        <TermEditDialog
          term={sub.term}
          terms={data.terms}
          documents={data.documents}
          currentDocId={currentDocId}
          busy={busy}
          error={sub.error}
          onSave={(fields) => saveTerm(sub.term, fields)}
          onCancel={() => setSub(null)}
        />
      )}
      {sub?.type === "merge" && data && (
        <MergeDialog
          source={sub.term}
          terms={data.terms}
          definitionCounts={definitionCounts}
          documents={data.documents}
          currentDocId={currentDocId}
          busy={busy}
          onMerge={(targetId) => merge(sub.term, targetId)}
          onCancel={() => setSub(null)}
        />
      )}
      {sub?.type === "delete" && (
        <ConfirmDialog
          title={deleting.length === 1 ? "Delete term" : `Delete ${deleting.length} terms`}
          message={
            <p>
              {deleting.length === 1
                ? `Delete “${data?.terms.find((t) => t.id === deleting[0])?.label ?? "this term"}”`
                : `Delete ${deleting.length} terms`}
              {deletingDefs > 0
                ? ` and ${deletingDefs === 1 ? "its definition" : `${deletingDefs} definitions`}`
                : ""}
              ? This can't be undone.
            </p>
          }
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => remove(sub.ids)}
          onCancel={() => setSub(null)}
        />
      )}
    </dialog>
  );
}

function SortHeader(props: {
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort(key: SortKey): void;
  numeric?: boolean;
}) {
  const { k, sort, onSort, numeric } = props;
  const active = sort.key === k;
  return (
    <th
      scope="col"
      className={numeric ? "numeric" : undefined}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="sort-button" onClick={() => onSort(k)}>
        {SORT_LABELS[k]}
        <span aria-hidden="true">{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
  );
}
