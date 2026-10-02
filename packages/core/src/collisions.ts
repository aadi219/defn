import type { Scope, Term } from "./model";
import { patternTokens, surfaceForms } from "./termIndex";

/** The parts of a term that decide whether it collides with another. */
export interface TermSurfaces {
  label: string;
  aliases: string[];
  caseSensitive: boolean;
  scope: Scope;
}

/**
 * Canonical key of a surface form: its normalized tokens joined by single spaces, so that
 * "Well-defined" and "well  defined" compare equal (they match the same text). Empty when the
 * surface has no word characters.
 */
export function surfaceKey(surface: string, caseSensitive: boolean): string {
  return patternTokens(surface, caseSensitive).join(" ");
}

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.type === "global" || b.type === "global") return a.type === b.type;
  return a.docId === b.docId;
}

/** Splits a comma-separated alias list, trimming and dropping empties and duplicates. */
export function parseAliases(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(",")) {
    const alias = part.trim().replace(/\s+/g, " ");
    if (alias && !seen.has(alias)) {
      seen.add(alias);
      out.push(alias);
    }
  }
  return out;
}

/** True when the label has at least one word token, i.e. it can ever match. */
export function isValidTermLabel(label: string): boolean {
  return surfaceKey(label, false).length > 0;
}

/**
 * Two surfaces collide when their case-folded keys are equal, unless both terms are case-sensitive
 * and their cased keys differ (e.g. case-sensitive "Ring" and "RING" can coexist).
 */
function surfacesCollide(a: string, aCased: boolean, b: string, bCased: boolean): boolean {
  const folded = surfaceKey(a, false);
  if (!folded || folded !== surfaceKey(b, false)) return false;
  if (aCased && bCased) return surfaceKey(a, true) === surfaceKey(b, true);
  return true;
}

/**
 * Returns the first existing term in the same scope that shares a surface form (label or alias)
 * with `candidate`, ignoring `excludeTermId` (the term being edited). See PLAN.md §4.3.
 */
export function findCollision(
  terms: readonly Term[],
  candidate: TermSurfaces,
  excludeTermId?: string,
): Term | undefined {
  const mine = [candidate.label, ...candidate.aliases];
  return terms.find(
    (t) =>
      t.id !== excludeTermId &&
      sameScope(t.scope, candidate.scope) &&
      surfaceForms(t).some((theirs) =>
        mine.some((s) => surfacesCollide(s, candidate.caseSensitive, theirs, t.caseSensitive)),
      ),
  );
}
