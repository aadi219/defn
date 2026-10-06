import type { Definition, Suppression, Term } from "@deflink/core";
import type { PageCssRect } from "./coords";

/** A linked occurrence of a term on a rendered page. */
export interface Occurrence {
  termId: string;
  /** Start / end offsets in the page's normalized text (folded and cased align). */
  start: number;
  end: number;
  /** Page-relative CSS px at `scale`, one per line fragment. */
  rects: PageCssRect[];
}

export interface PageOccurrences {
  page: number;
  scale: number;
  occurrences: Occurrence[];
}

export function rectsIntersect(a: PageCssRect, b: PageCssRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

export interface FilterContext {
  page: number;
  terms: ReadonlyMap<string, Term>;
  /** Suppressions for this document and page. */
  suppressions: readonly Suppression[];
  /** Definition regions on this page, in the same CSS px space as the occurrences. */
  definitionRegions: readonly { termId: string; rects: readonly PageCssRect[] }[];
  /** "Only link after first definition": first definition page per document-scoped term. */
  firstDefinitionPage?: ReadonlyMap<string, number>;
}

/**
 * Drops occurrences inside their own term's definition region, ones the user suppressed, and
 * (when `firstDefinitionPage` is given) document-scoped ones before the term's first definition
 * page (PLAN.md §5.6).
 */
export function filterOccurrences(
  occurrences: readonly Occurrence[],
  ctx: FilterContext,
): Occurrence[] {
  const suppressed = new Set(ctx.suppressions.map((s) => `${s.termId}@${s.offset}`));
  return occurrences.filter((occ) => {
    if (suppressed.has(`${occ.termId}@${occ.start}`)) return false;
    const ownRegion = ctx.definitionRegions.some(
      (d) =>
        d.termId === occ.termId &&
        d.rects.some((dr) => occ.rects.some((or) => rectsIntersect(dr, or))),
    );
    if (ownRegion) return false;
    if (ctx.firstDefinitionPage) {
      const term = ctx.terms.get(occ.termId);
      const first = ctx.firstDefinitionPage.get(occ.termId);
      if (term?.scope.type === "document" && first !== undefined && ctx.page < first) return false;
    }
    return true;
  });
}

/** First page with a definition in this document, per term. */
export function firstDefinitionPages(definitions: readonly Definition[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const d of definitions) {
    const prev = first.get(d.termId);
    if (prev === undefined || d.page < prev) first.set(d.termId, d.page);
  }
  return first;
}

/** The occurrence and rect under a page-relative point, if any. */
export function hitTest(
  occurrences: readonly Occurrence[],
  x: number,
  y: number,
): { occurrence: Occurrence; rect: PageCssRect } | null {
  for (const occurrence of occurrences) {
    for (const rect of occurrence.rects) {
      if (
        x >= rect.left &&
        x <= rect.left + rect.width &&
        y >= rect.top &&
        y <= rect.top + rect.height
      ) {
        return { occurrence, rect };
      }
    }
  }
  return null;
}
