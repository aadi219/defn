/**
 * True when a global single-key shortcut should be ignored: a modifier is held, the user is typing
 * in a field, or a modal dialog is open.
 */
export function shouldIgnoreShortcut(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target;
  if (
    t instanceof HTMLElement &&
    (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
  ) {
    return true;
  }
  return document.querySelector("dialog[open]") !== null;
}
