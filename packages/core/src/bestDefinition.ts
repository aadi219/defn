import type { Definition } from "./model";

/** Top edge of a definition's region in PDF user space (larger y is higher on the page). */
function top(d: Definition): number {
  let y = -Infinity;
  for (const r of d.rects) y = Math.max(y, r.y1, r.y2);
  return y;
}

/** Orders definitions by reading position: page, then top of the region, top first. */
export function compareByPosition(a: Definition, b: Definition): number {
  return a.page - b.page || top(b) - top(a);
}

/**
 * The definition to show or pin for a term (decision 6): the earliest one in `docId`, else the
 * most recently created one.
 */
export function bestDefinition(
  definitions: readonly Definition[],
  docId: string,
): Definition | undefined {
  let best: Definition | undefined;
  for (const d of definitions) {
    if (d.docId === docId) {
      if (!best || best.docId !== docId || compareByPosition(d, best) < 0) best = d;
    } else if (!best || (best.docId !== docId && d.createdAt > best.createdAt)) {
      best = d;
    }
  }
  return best;
}
