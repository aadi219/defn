import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DEFINITION_KINDS,
  findCollision,
  isValidTermLabel,
  parseAliases,
  type Definition,
  type DefinitionKind,
  type Scope,
  type Term,
} from "@deflink/core";
import { useModalDialog } from "../../util/useModalDialog";

export interface MarkDefinitionValues {
  term: string;
  aliases: string[];
  kind: DefinitionKind;
  label: string;
  scope: Scope;
  caseSensitive: boolean;
}

/**
 * Create a new term (in edit mode: update the definition's own term), or add the definition to an
 * existing, colliding term (in edit mode: move it there).
 */
export type SaveTarget = { type: "new" } | { type: "existing"; term: Term };

/** A saved definition being edited, with its term. */
export interface EditingDefinition {
  definition: Definition;
  term: Term;
  /** Number of the term's other definitions, which share the term fields. */
  otherDefinitions: number;
}

interface Props {
  /** Document that "This document" scope refers to. */
  docId: string;
  /** Edit an existing definition instead of marking a new one. */
  editing?: EditingDefinition;
  /** Selected text, shown for reference. */
  text: string;
  /** Object URL of the crop preview, once rendered. */
  cropUrl: string | null;
  /** Suggested term (PLAN.md §6.4), prefilled and selected. */
  initialTerm?: string;
  /** Confidence of `initialTerm`; a low-confidence guess is flagged for checking. */
  suggestionConfidence?: "high" | "low";
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
  const { docId, editing, text, cropUrl, terms, saving, error, onSave, onCancel } = props;
  const editTerm = editing?.term;
  const dialog = useRef<HTMLDialogElement>(null);
  const termInput = useRef<HTMLInputElement>(null);
  const id = useId();

  const [term, setTerm] = useState(editTerm?.label ?? props.initialTerm ?? "");
  const [aliases, setAliases] = useState(editTerm?.aliases.join(", ") ?? "");
  const [kind, setKind] = useState<DefinitionKind>(editing?.definition.kind ?? "definition");
  const [label, setLabel] = useState(editing?.definition.label ?? "");
  const [scopeType, setScopeType] = useState<Scope["type"]>(editTerm?.scope.type ?? "document");
  const [caseSensitive, setCaseSensitive] = useState(editTerm?.caseSensitive ?? false);
  const [submitted, setSubmitted] = useState(false);

  useModalDialog(dialog);
  useEffect(() => {
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
    ? findCollision(
        terms,
        {
          label: values.term,
          aliases: values.aliases,
          caseSensitive: values.caseSensitive,
          scope: values.scope,
        },
        editTerm?.id,
      )
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
        <h2 id={`${id}-title`}>{editing ? "Edit definition" : "Mark as definition"}</h2>

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
            aria-describedby={`${id}-term-help ${id}-term-hint`}
            placeholder="e.g. compact space"
          />
        </label>
        {props.suggestionConfidence === "low" && term === props.initialTerm && (
          <p id={`${id}-term-hint`} className="field-hint">
            Guessed from the wording. Check it before saving.
          </p>
        )}
        {editing && editing.otherDefinitions > 0 && (
          <p className="field-hint">
            Term, aliases, scope and case sensitivity are shared with {editing.otherDefinitions}{" "}
            other definition{editing.otherDefinitions === 1 ? "" : "s"}.
          </p>
        )}
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
                {editing
                  ? `Move this definition to “${collision.label}”`
                  : `Add as another definition of “${collision.label}”`}
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
