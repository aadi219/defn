import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DEFINITION_KINDS,
  findCollision,
  isValidTermLabel,
  parseAliases,
  type DefinitionKind,
  type Scope,
  type Term,
} from "@deflink/core";

export interface MarkDefinitionValues {
  term: string;
  aliases: string[];
  kind: DefinitionKind;
  label: string;
  scope: Scope;
  caseSensitive: boolean;
}

/** Create a new term, or add the definition to an existing (colliding) term. */
export type SaveTarget = { type: "new" } | { type: "existing"; term: Term };

interface Props {
  docId: string;
  /** Selected text, shown for reference. */
  text: string;
  /** Object URL of the crop preview, once rendered. */
  cropUrl: string | null;
  initialTerm?: string;
  terms: readonly Term[];
  saving: boolean;
  error: string | null;
  onSave(values: MarkDefinitionValues, target: SaveTarget): void;
  onCancel(): void;
}

const KIND_LABELS: Record<DefinitionKind, string> = {
  definition: "Definition",
  theorem: "Theorem",
  lemma: "Lemma",
  proposition: "Proposition",
  corollary: "Corollary",
  notation: "Notation",
  other: "Other",
};

/** Modal form for marking a selection as a definition (PLAN.md §1.1 step 2, §6.2). */
export function MarkDefinitionDialog(props: Props) {
  const { docId, text, cropUrl, terms, saving, error, onSave, onCancel } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const termInput = useRef<HTMLInputElement>(null);
  const id = useId();

  const [term, setTerm] = useState(props.initialTerm ?? "");
  const [aliases, setAliases] = useState("");
  const [kind, setKind] = useState<DefinitionKind>("definition");
  const [label, setLabel] = useState("");
  const [scopeType, setScopeType] = useState<Scope["type"]>("document");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    termInput.current?.focus();
    termInput.current?.select();
  }, []);

  const values: MarkDefinitionValues = useMemo(
    () => ({
      term: term.trim().replace(/\s+/g, " "),
      aliases: parseAliases(aliases),
      kind,
      label: label.trim(),
      scope: scopeType === "global" ? { type: "global" } : { type: "document", docId },
      caseSensitive,
    }),
    [term, aliases, kind, label, scopeType, docId, caseSensitive],
  );
  const valid = isValidTermLabel(values.term);
  const collision = valid
    ? findCollision(terms, {
        label: values.term,
        aliases: values.aliases,
        caseSensitive: values.caseSensitive,
        scope: values.scope,
      })
    : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || collision || saving) return;
    onSave(values, { type: "new" });
  };

  return (
    <dialog
      ref={dialog}
      className="mark-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form onSubmit={submit}>
        <h2 id={`${id}-title`}>Mark as definition</h2>

        <div className="mark-preview">
          {cropUrl ? (
            <img src={cropUrl} alt={`Selected region: ${text}`} />
          ) : (
            <p className="muted">{text}</p>
          )}
        </div>

        <label className="field">
          <span>Term</span>
          <input
            ref={termInput}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-invalid={submitted && !valid}
            aria-describedby={`${id}-term-help`}
            placeholder="e.g. compact space"
          />
        </label>
        {submitted && !valid && (
          <p id={`${id}-term-help`} className="field-error">
            Enter the term being defined.
          </p>
        )}

        {collision && (
          <div className="collision" role="alert">
            <p>
              A term <strong>“{collision.label}”</strong> already exists in this scope.
            </p>
            <div className="collision-actions">
              <button
                type="button"
                onClick={() => onSave(values, { type: "existing", term: collision })}
                disabled={saving}
              >
                Add as another definition of “{collision.label}”
              </button>
              <button
                type="button"
                onClick={() => {
                  termInput.current?.focus();
                  termInput.current?.select();
                }}
              >
                Rename
              </button>
            </div>
          </div>
        )}

        <label className="field">
          <span>Aliases</span>
          <input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="comma-separated, optional"
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as DefinitionKind)}>
              {DEFINITION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Def 2.3"
            />
          </label>
        </div>

        <fieldset className="field">
          <legend>Scope</legend>
          <label>
            <input
              type="radio"
              name={`${id}-scope`}
              checked={scopeType === "document"}
              onChange={() => setScopeType("document")}
            />
            This document
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-scope`}
              checked={scopeType === "global"}
              onChange={() => setScopeType("global")}
            />
            Global
          </label>
        </fieldset>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Case sensitive
        </label>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving || !!collision}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
