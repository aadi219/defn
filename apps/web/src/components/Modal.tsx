import { useId, useRef, type ReactNode } from "react";
import { useModalDialog } from "../util/useModalDialog";

/** A native modal dialog that opens on mount; Esc calls `onCancel` unless `busy`. */
export function Modal(props: {
  title: string;
  className?: string;
  busy?: boolean;
  onCancel(): void;
  children: ReactNode;
}) {
  const { title, className, busy, onCancel, children } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useModalDialog(dialog);
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
