import type { KeyboardEvent } from "react";

/** Arrow-key, Home and End navigation between the enabled menu items of a `role="menu"` list. */
export function onMenuKeyDown(e: KeyboardEvent<HTMLElement>) {
  const items = [
    ...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
  ];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = {
    ArrowDown: (at + 1) % items.length,
    ArrowUp: (at - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1,
  }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  items[next]?.focus();
}
