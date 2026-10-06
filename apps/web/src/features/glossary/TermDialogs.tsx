import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  findCollision,
  isValidTermLabel,
  mergeTermInto,
  parseAliases,
  type DocumentRecord,
  type Scope,
  type Term,
} from "@deflink/core";
import type { TermFields } from "../../store/repo";
import { scopeLabel } from "./glossaryRows";

/** A native modal dialog that opens on mount; Esc calls `onCancel` unless `busy`. */
function Modal(props: {
  title: string;
  className?: string;
  busy?: boolean;
  onCancel(): void;
  children: ReactNode;
}) {
  const { title, className, busy, onCancel, children } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`mark-dialog ${className ?? ""}`}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </dialog>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { title, message, confirmLabel, busy, onConfirm, onCancel } = props;
  return (
    <Modal title={title} className="confirm-dialog" busy={busy} onCancel={onCancel}>
      <div>{message}</div>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </button>
        <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

const GLOBAL = "\u0000global";

/** Edits a term's label, aliases, scope and case sensitivity (PLAN.md §7.5). */
export function TermEditDialog(props: {
  term: Term;
  terms: readonly Term[];
  documents: ReadonlyMap<string, DocumentRecord>;
  currentDocId?: string;
  busy: boolean;
  error: string | null;
  onSave(fields: TermFields): void;
  onCancel(): void;
}) {
  const { term, terms, documents, currentDocId, busy, error, onSave, onCancel } = props;
  const [label, setLabel] = useState(term.label);
  const [aliases, setAliases] = useState(term.aliases.join(", "));
  const [scopeValue, setScopeValue] = useState(
    term.scope.type === "global" ? GLOBAL : term.scope.docId,
  );
  const [caseSensitive, setCaseSensitive] = useState(term.caseSensitive);

  /** Global, every known document, and the term's own document even if it is unknown. */
  const scopeOptions = useMemo(() => {
    const ids = new Set(documents.keys());
    if (term.scope.type === "document") ids.add(term.scope.docId);
    const docs = [...ids].map((docId) => ({
      value: docId,
      label: scopeLabel({ ...term, scope: { type: "document", docId } }, documents, currentDocId),
    }));
    docs.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: GLOBAL, label: "Global" }, ...docs];
  }, [documents, term, currentDocId]);

  const fields: TermFields = {
    label: label.trim().replace(/\s+/g, " "),
    aliases: parseAliases(aliases),
    caseSensitive,
    scope: (scopeValue === GLOBAL
      ? { type: "global" }
      : { type: "document", docId: scopeValue }) satisfies Scope,
  };
  const valid = isValidTermLabel(fields.label);
  const collision = valid ? findCollision(terms, fields, term.id) : undefined;

  return (
    <Modal title={`Edit term “${term.label}”`} busy={busy} onCancel={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !collision && !busy) onSave(fields);
        }}
      >
        <label className="field">
          <span>Term</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-invalid={!valid}
            autoFocus
          />
        </label>
        {!valid && <p className="field-error">Enter the term.</p>}
        <label className="field">
          <span>Aliases</span>
          <input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="comma-separated, optional"
          />
        </label>
        <label className="field">
          <span>Scope</span>
          <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
            {scopeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Case sensitive
        </label>
        {collision && (
          <p className="collision" role="alert">
            “{collision.label}” already uses one of these forms in this scope. Rename, or merge the
            two terms instead.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !valid || !!collision}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Picks a term to merge `source` into, with a preview of the result (PLAN.md §4.3, §7.5). */
export function MergeDialog(props: {
  source: Term;
  terms: readonly Term[];
  definitionCounts: ReadonlyMap<string, number>;
  documents: ReadonlyMap<string, DocumentRecord>;
  currentDocId?: string;
  busy: boolean;
  onMerge(targetId: string): void;
  onCancel(): void;
}) {
  const { source, terms, definitionCounts, documents, currentDocId, busy, onMerge, onCancel } =
    props;
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const id = useId();

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return terms
      .filter((t) => t.id !== source.id)
      .filter((t) => !q || [t.label, ...t.aliases].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [terms, source.id, query]);

  const target = terms.find((t) => t.id === targetId);
  const preview = target ? mergeTermInto(target, source, terms, 0) : null;
  const added = preview?.term.aliases.slice(target!.aliases.length) ?? [];
  const moving = definitionCounts.get(source.id) ?? 0;

  return (
    <Modal title={`Merge “${source.label}” into…`} busy={busy} onCancel={onCancel}>
      <label className="field">
        <span>Find a term</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms"
          autoFocus
        />
      </label>
      <ul className="merge-candidates" role="radiogroup" aria-label="Merge target">
        {candidates.length === 0 && <li className="muted">No other terms match.</li>}
        {candidates.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="radio"
                name={`${id}-target`}
                checked={t.id === targetId}
                onChange={() => setTargetId(t.id)}
              />
              <strong>{t.label}</strong>{" "}
              <span className="muted">
                {scopeLabel(t, documents, currentDocId)} · {definitionCounts.get(t.id) ?? 0} def.
              </span>
            </label>
          </li>
        ))}
      </ul>
      {target && preview && (
        <div className="merge-preview">
          <p>
            “{source.label}” will be deleted.{" "}
            {moving === 1 ? "Its definition" : `Its ${moving} definitions`} and hidden links move to
            “{target.label}”, which keeps its label and scope.
          </p>
          {added.length > 0 && <p>New aliases: {added.join(", ")}.</p>}
          {preview.dropped.length > 0 && (
            <p>Not added (used by another term in that scope): {preview.dropped.join(", ")}.</p>
          )}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !target}
          onClick={() => target && onMerge(target.id)}
        >
          {busy ? "Merging…" : "Merge"}
        </button>
      </div>
    </Modal>
  );
}
