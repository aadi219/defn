import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import type { Definition, Term } from "@defn/core";
import { useCropUrl } from "../popover/useCropUrl";
import {
  MarkDefinitionDialog,
  type EditingDefinition,
  type MarkDefinitionValues,
  type SaveTarget,
} from "../markDefinition/MarkDefinitionDialog";
import {
  deleteDefinition,
  listDefinitionsForTerm,
  TermCollisionError,
  updateDefinition,
} from "../../store/repo";
import { useModalDialog } from "../../util/useModalDialog";

interface Options {
  terms: readonly Term[];
  reload(): Promise<void>;
  toast(message: string): void;
}

interface EditState extends EditingDefinition {
  saving: boolean;
  error: string | null;
}

interface DeleteState {
  definition: Definition;
  term: Term | undefined;
  /** The term has no other definitions. */
  isLast: boolean;
  busy: boolean;
}

/**
 * Edit and delete flows for saved definitions. `startEdit` / `startDelete` open the dialogs, which
 * are returned as `dialogs` for the caller to render.
 */
export function useDefinitionActions({ terms, reload, toast }: Options) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const [del, setDel] = useState<DeleteState | null>(null);

  const otherDefinitionCount = async (d: Definition) =>
    (await listDefinitionsForTerm(d.termId)).filter((x) => x.id !== d.id).length;

  const startEdit = useCallback(
    async (definition: Definition) => {
      const term = terms.find((t) => t.id === definition.termId);
      if (!term) {
        toast("This definition's term no longer exists.");
        return;
      }
      const otherDefinitions = await otherDefinitionCount(definition);
      setEdit({ definition, term, otherDefinitions, saving: false, error: null });
    },
    [terms, toast],
  );

  const startDelete = useCallback(
    async (definition: Definition) => {
      const term = terms.find((t) => t.id === definition.termId);
      const isLast = (await otherDefinitionCount(definition)) === 0;
      setDel({ definition, term, isLast, busy: false });
    },
    [terms],
  );

  const saveEdit = async (values: MarkDefinitionValues, target: SaveTarget) => {
    if (!edit) return;
    setEdit({ ...edit, saving: true, error: null });
    try {
      const { oldTermDeleted } = await updateDefinition({
        definitionId: edit.definition.id,
        definition: { kind: values.kind, label: values.label },
        term:
          target.type === "new"
            ? {
                update: {
                  label: values.term,
                  aliases: values.aliases,
                  caseSensitive: values.caseSensitive,
                  scope: values.scope,
                },
              }
            : { moveTo: target.term.id },
      });
      await reload();
      setEdit(null);
      toast(
        target.type === "new"
          ? "Saved changes."
          : `Moved the definition to “${target.term.label}”` +
              (oldTermDeleted ? ` and deleted the now-empty “${edit.term.label}”.` : "."),
      );
    } catch (err) {
      console.error(err);
      const message =
        err instanceof TermCollisionError
          ? `“${err.existing.label}” was just added in this scope. Choose another term.`
          : `Could not save: ${String(err)}`;
      setEdit((e) => (e ? { ...e, saving: false, error: message } : e));
      if (err instanceof TermCollisionError) await reload();
    }
  };

  const confirmDelete = async (deleteTermIfLast: boolean) => {
    if (!del) return;
    setDel({ ...del, busy: true });
    try {
      const { termDeleted } = await deleteDefinition(del.definition.id, { deleteTermIfLast });
      await reload();
      setDel(null);
      const label = del.term?.label ?? "this term";
      toast(termDeleted ? `Deleted “${label}”.` : `Deleted a definition of “${label}”.`);
    } catch (err) {
      console.error(err);
      setDel(null);
      toast(`Could not delete: ${String(err)}`);
    }
  };

  const dialogs: ReactNode = (
    <>
      {edit && (
        <EditDialog
          edit={edit}
          terms={terms}
          onSave={(values, target) => void saveEdit(values, target)}
          onCancel={() => setEdit(null)}
        />
      )}
      {del && (
        <DeleteDefinitionDialog
          state={del}
          onConfirm={(deleteTerm) => void confirmDelete(deleteTerm)}
          onCancel={() => setDel(null)}
        />
      )}
    </>
  );

  return {
    startEdit: (d: Definition) => void startEdit(d).catch(reportError(toast)),
    startDelete: (d: Definition) => void startDelete(d).catch(reportError(toast)),
    dialogs,
  };
}

const reportError = (toast: (message: string) => void) => (err: unknown) => {
  console.error(err);
  toast(`Something went wrong: ${String(err)}`);
};

function EditDialog(props: {
  edit: EditState;
  terms: readonly Term[];
  onSave(values: MarkDefinitionValues, target: SaveTarget): void;
  onCancel(): void;
}) {
  const { edit, terms, onSave, onCancel } = props;
  const crop = useCropUrl(edit.definition.cropId);
  return (
    <MarkDefinitionDialog
      docId={edit.definition.docId}
      editing={edit}
      text={edit.definition.text}
      cropUrl={crop?.url ?? null}
      terms={terms}
      saving={edit.saving}
      error={edit.error}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function DeleteDefinitionDialog(props: {
  state: DeleteState;
  onConfirm(deleteTerm: boolean): void;
  onCancel(): void;
}) {
  const { state, onConfirm, onCancel } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [deleteTerm, setDeleteTerm] = useState(true);
  const label = state.term?.label ?? "this term";

  useModalDialog(dialog);

  return (
    <dialog
      ref={dialog}
      className="mark-dialog confirm-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(state.isLast && deleteTerm);
        }}
      >
        <h2 id={`${id}-title`}>Delete definition</h2>
        <p>
          Delete this definition of <strong>“{label}”</strong>
          {state.definition.label ? ` (${state.definition.label})` : ""}, p. {state.definition.page}
          ? This can't be undone.
        </p>
        {state.isLast && state.term && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={deleteTerm}
              onChange={(e) => setDeleteTerm(e.target.checked)}
            />
            Also delete the term “{label}”, which has no other definitions
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={state.busy}>
            {state.busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
