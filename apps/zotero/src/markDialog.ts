import {
  DEFINITION_KINDS,
  findCollision,
  isValidTermLabel,
  parseAliases,
  suggestTerm,
  type DefinitionKind,
  type Scope,
  type Term,
} from "@defn/core";
import { ensureStyle, h } from "./dom";

export interface MarkValues {
  term: string;
  aliases: string[];
  kind: DefinitionKind;
  label: string;
  scope: Scope;
  caseSensitive: boolean;
}

/** Create a new term, or add the definition to an existing (colliding) one. */
export type MarkTarget = { type: "new" } | { type: "existing"; term: Term };

export const KIND_LABELS: Record<DefinitionKind, string> = {
  definition: "Definition",
  theorem: "Theorem",
  lemma: "Lemma",
  proposition: "Proposition",
  corollary: "Corollary",
  notation: "Notation",
  other: "Other",
};

const CSS = `
.defn-dialog { width: min(520px, calc(100vw - 2rem)); border: 1px solid #ccc; border-radius: 8px;
  padding: 1rem; font: 13px system-ui, sans-serif; color: #222; background: #fff; }
.defn-dialog::backdrop { background: rgb(0 0 0 / 0.3); }
.defn-dialog h2 { margin: 0 0 0.6rem; font-size: 15px; }
.defn-dialog .defn-text { max-height: 6.5em; overflow: auto; margin: 0 0 0.6rem; color: #555;
  border-left: 3px solid #ffd400; padding-left: 0.5rem; }
.defn-dialog label.field { display: flex; flex-direction: column; gap: 2px; margin-bottom: 0.5rem; }
.defn-dialog label.field > span { color: #666; font-size: 12px; }
.defn-dialog input[type=text], .defn-dialog select { font: inherit; padding: 4px 6px; }
.defn-dialog .row { display: flex; gap: 0.75rem; }
.defn-dialog .row > * { flex: 1; }
.defn-dialog .inline { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.5rem; }
.defn-dialog .hint { color: #666; font-size: 12px; margin: -0.3rem 0 0.5rem; }
.defn-dialog .collision { background: #fff6db; border: 1px solid #f0d78a; border-radius: 6px;
  padding: 0.4rem 0.6rem; margin-bottom: 0.5rem; }
.defn-dialog .error { color: #c62828; }
.defn-dialog .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem; }
.defn-dialog :focus-visible { outline: 2px solid #2f5bd3; outline-offset: 1px; }
`;

/**
 * The mark-definition dialog (PLAN.md §6.2) as a native modal `<dialog>` in the reader document.
 * `onSave` may reject with a message to show; the dialog then stays open. Resolves to whether a
 * definition was saved.
 */
export function openMarkDialog(options: {
  doc: Document;
  docId: string;
  text: string;
  terms: () => readonly Term[];
  onSave(values: MarkValues, target: MarkTarget): Promise<void>;
}): Promise<boolean> {
  const { doc, docId, text, terms, onSave } = options;
  ensureStyle(doc, "defn-dialog-style", CSS);
  const suggestion = suggestTerm(text);

  const term = h(doc, "input", {
    type: "text",
    value: suggestion.term,
    placeholder: "e.g. compact space",
  });
  const aliases = h(doc, "input", { type: "text", placeholder: "comma-separated, optional" });
  const kind = h(
    doc,
    "select",
    {},
    ...DEFINITION_KINDS.map((k) => h(doc, "option", { value: k }, KIND_LABELS[k])),
  );
  const label = h(doc, "input", { type: "text", placeholder: "e.g. Def 2.3" });
  const scopeDoc = h(doc, "input", { type: "radio", name: "defn-scope", checked: true });
  const scopeGlobal = h(doc, "input", { type: "radio", name: "defn-scope" });
  const caseSensitive = h(doc, "input", { type: "checkbox" });
  const hint = h(
    doc,
    "p",
    { className: "hint" },
    "Guessed from the wording. Check it before saving.",
  );
  const collisionBox = h(doc, "div", { className: "collision", role: "alert" });
  const error = h(doc, "p", { className: "error", role: "alert" });
  const save = h(doc, "button", { type: "submit" }, "Save");
  const cancel = h(doc, "button", { type: "button" }, "Cancel");

  const values = (): MarkValues => ({
    term: term.value.trim().replace(/\s+/g, " "),
    aliases: parseAliases(aliases.value),
    kind: kind.value as DefinitionKind,
    label: label.value.trim(),
    scope: scopeGlobal.checked ? { type: "global" } : { type: "document", docId },
    caseSensitive: caseSensitive.checked,
  });

  const form = h(
    doc,
    "form",
    { method: "dialog" },
    h(doc, "h2", {}, "Mark as definition"),
    h(doc, "p", { className: "defn-text" }, text),
    h(doc, "label", { className: "field" }, h(doc, "span", {}, "Term"), term),
    hint,
    collisionBox,
    h(doc, "label", { className: "field" }, h(doc, "span", {}, "Aliases"), aliases),
    h(
      doc,
      "div",
      { className: "row" },
      h(doc, "label", { className: "field" }, h(doc, "span", {}, "Kind"), kind),
      h(doc, "label", { className: "field" }, h(doc, "span", {}, "Label"), label),
    ),
    h(
      doc,
      "div",
      { className: "inline", role: "radiogroup", "aria-label": "Scope" },
      h(doc, "label", {}, scopeDoc, " This document"),
      h(doc, "label", {}, scopeGlobal, " Global"),
      h(doc, "label", {}, caseSensitive, " Case sensitive"),
    ),
    error,
    h(doc, "div", { className: "actions" }, cancel, save),
  );
  const dialog = h(
    doc,
    "dialog",
    { className: "defn-dialog", "aria-label": "Mark as definition" },
    form,
  );

  return new Promise((resolve) => {
    let busy = false;
    let collision: Term | undefined;
    const previous = doc.activeElement as HTMLElement | null;

    const close = (saved: boolean) => {
      dialog.close();
      dialog.remove();
      previous?.focus?.();
      resolve(saved);
    };

    const update = () => {
      const v = values();
      const valid = isValidTermLabel(v.term);
      collision = valid ? findCollision(terms(), { ...v, label: v.term }) : undefined;
      hint.hidden = !(
        suggestion.confidence === "low" &&
        suggestion.term &&
        term.value === suggestion.term
      );
      collisionBox.replaceChildren();
      collisionBox.hidden = !collision;
      if (collision) {
        const existing = collision;
        collisionBox.append(
          h(doc, "p", {}, `A term “${existing.label}” already exists in this scope.`),
          h(
            doc,
            "button",
            { type: "button", onClick: () => void submit({ type: "existing", term: existing }) },
            `Add as another definition of “${existing.label}”`,
          ),
        );
      }
      save.disabled = busy || !valid || !!collision;
    };

    const submit = async (target: MarkTarget) => {
      if (busy) return;
      busy = true;
      error.textContent = "";
      update();
      try {
        await onSave(values(), target);
        close(true);
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err);
        busy = false;
        update();
      }
    };

    for (const el of [term, aliases, label, scopeDoc, scopeGlobal, caseSensitive]) {
      el.addEventListener("input", update);
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!save.disabled) void submit({ type: "new" });
    });
    cancel.addEventListener("click", () => close(false));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (!busy) close(false);
    });

    (doc.body ?? doc.documentElement).append(dialog);
    update();
    dialog.showModal();
    term.focus();
    term.select();
  });
}
