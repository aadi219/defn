import { useEffect, type RefObject } from "react";

/**
 * Opens a `<dialog>` as a modal on mount and, when it unmounts, returns focus to whatever had it
 * before (removing an open dialog from the DOM would otherwise leave focus on <body>).
 */
export function useModalDialog(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (el && !el.open) el.showModal();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref]);
}
