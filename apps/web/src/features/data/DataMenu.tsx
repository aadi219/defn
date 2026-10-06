import { useEffect, useId, useRef, useState } from "react";
import {
  validateExportFile,
  type ExportCrop,
  type ExportFileV1,
  type ImportCounts,
  type ImportPlan,
} from "@deflink/core";
import { notifyStoreChanged } from "../../state/store";
import { exportStore, importStore } from "../../store/repo";
import { useToast } from "../toast/toast";
import { onMenuKeyDown } from "../../util/menuKeys";
import { useModalDialog } from "../../util/useModalDialog";

/** `deflink-YYYY-MM-DD.json` in local time (PLAN.md §8). */
export function exportFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `deflink-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 terms, 3 definitions" for the non-zero counts that matter to the user. */
function describeCounts(
  c: Pick<ImportCounts, "documents" | "terms" | "definitions" | "suppressions">,
) {
  const parts = [
    c.terms && plural(c.terms, "term"),
    c.definitions && plural(c.definitions, "definition"),
    c.documents && plural(c.documents, "document"),
    c.suppressions && plural(c.suppressions, "hidden link"),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing";
}

/** Toolbar menu for exporting and importing the whole store as JSON (PLAN.md §8). */
export function DataMenu() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ name: string; file: ExportFileV1 } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Node && root.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const doExport = async () => {
    setOpen(false);
    try {
      const file = await exportStore();
      const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
      download(exportFileName(new Date()), blob);
      toast(`Exported ${describeCounts(countsOf(file))}.`);
    } catch (err) {
      console.error(err);
      toast(`Export failed: ${String(err)}`);
    }
  };

  const readImport = async (f: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      toast(`“${f.name}” is not valid JSON.`);
      return;
    }
    const result = validateExportFile(json);
    if (!result.ok) {
      toast(`“${f.name}” is not a DefLink export (${result.error}).`);
      return;
    }
    setPending({ name: f.name, file: result.file });
  };

  return (
    <div className="data-menu" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Data ▾
      </button>
      {open && (
        <ul
          className="context-menu dropdown"
          role="menu"
          aria-label="Data"
          onKeyDown={onMenuKeyDown}
        >
          <li role="none">
            <button type="button" role="menuitem" autoFocus onClick={() => void doExport()}>
              Export all…
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                fileInput.current?.click();
              }}
            >
              Import…
            </button>
          </li>
        </ul>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void readImport(f);
        }}
      />
      {pending && (
        <ImportDialog name={pending.name} file={pending.file} onClose={() => setPending(null)} />
      )}
    </div>
  );
}

function countsOf(file: ExportFileV1): ImportCounts {
  return {
    documents: file.documents.length,
    terms: file.terms.length,
    definitions: file.definitions.length,
    crops: file.crops.length,
    suppressions: file.suppressions.length,
  };
}

function ImportDialog(props: { name: string; file: ExportFileV1; onClose(): void }) {
  const { name, file, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [overwrite, setOverwrite] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "importing" }
    | { status: "done"; plan: ImportPlan<ExportCrop> }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useModalDialog(dialog);

  const run = async () => {
    setState({ status: "importing" });
    try {
      const plan = await importStore(file, { overwrite });
      notifyStoreChanged();
      setState({ status: "done", plan });
    } catch (err) {
      console.error(err);
      setState({ status: "error", message: String(err) });
    }
  };

  const exportedAt = new Date(file.exportedAt);
  return (
    <dialog
      ref={dialog}
      className="mark-dialog confirm-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (state.status !== "importing") onClose();
      }}
    >
      <h2 id={`${id}-title`}>Import</h2>
      <p>
        <strong>{name}</strong>
        {Number.isNaN(exportedAt.getTime())
          ? ""
          : `, exported ${exportedAt.toLocaleString()}`}: {describeCounts(countsOf(file))}.
      </p>

      {state.status === "done" ? (
        <ImportResult plan={state.plan} />
      ) : (
        <>
          <p className="muted">
            Terms that match an existing term in the same scope are merged into it.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={state.status === "importing"}
            />
            Overwrite records that already exist (same id)
          </label>
          {state.status === "error" && (
            <p className="field-error" role="alert">
              Import failed: {state.message}
            </p>
          )}
        </>
      )}

      <div className="dialog-actions">
        {state.status === "done" ? (
          <button type="button" className="primary" onClick={onClose} autoFocus>
            Close
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} disabled={state.status === "importing"}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void run()}
              disabled={state.status === "importing"}
            >
              {state.status === "importing" ? "Importing…" : "Import"}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}

function ImportResult({ plan }: { plan: ImportPlan<ExportCrop> }) {
  const replaced = describeCounts(plan.replaced);
  const skipped = describeCounts(plan.skipped);
  return (
    <div role="status" className="import-result">
      <p>Added {describeCounts(plan.added)}.</p>
      {replaced !== "nothing" && <p>Replaced {replaced}.</p>}
      {skipped !== "nothing" && <p>Skipped {skipped} that already existed.</p>}
      {plan.merged.length > 0 && (
        <>
          <p>Merged into existing terms:</p>
          <ul>
            {plan.merged.map((m, i) => (
              <li key={i}>
                “{m.from}” → “{m.into}”
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
