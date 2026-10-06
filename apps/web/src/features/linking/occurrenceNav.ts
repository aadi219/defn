import type { PageCssRect } from "@defn/viewer";
import type { Occurrence } from "@defn/viewer";

export interface NavItem {
  page: number;
  occurrence: Occurrence;
  /** First line fragment, where the popover anchors. */
  rect: PageCssRect;
}

/** Occurrences in reading order: page, then line (top), then left to right. */
export function orderOccurrences(byPage: Iterable<[number, readonly Occurrence[]]>): NavItem[] {
  const items: NavItem[] = [];
  for (const [page, occurrences] of byPage) {
    for (const occurrence of occurrences) {
      const rect = occurrence.rects[0];
      if (rect) items.push({ page, occurrence, rect });
    }
  }
  return items.sort(
    (a, b) => a.page - b.page || a.rect.top - b.rect.top || a.rect.left - b.rect.left,
  );
}

const same = (a: NavItem, b: { page: number; occurrence: Occurrence }) =>
  a.page === b.page &&
  a.occurrence.termId === b.occurrence.termId &&
  a.occurrence.start === b.occurrence.start;

/**
 * The occurrence `]` (dir 1) or `[` (dir -1) moves to (PLAN.md §M8 keyboard access): the next or
 * previous one after `current` if it is listed, wrapping around; otherwise the first one on or
 * after `currentPage` (or the last one on or before it, going back).
 */
export function stepOccurrence(
  items: readonly NavItem[],
  current: { page: number; occurrence: Occurrence } | null,
  currentPage: number,
  dir: 1 | -1,
): NavItem | undefined {
  if (items.length === 0) return undefined;
  const at = current ? items.findIndex((i) => same(i, current)) : -1;
  if (at !== -1) return items[(at + dir + items.length) % items.length];
  if (dir === 1) return items.find((i) => i.page >= currentPage) ?? items[0];
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.page <= currentPage) return items[i];
  return items[items.length - 1];
}
