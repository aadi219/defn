import { matchText, type TermMatcher } from "@defn/core";

/**
 * Terms mentioned in a definition's text (PLAN.md §7.4 nested linking): term ids in order of
 * first mention, deduplicated, excluding the definition's own term.
 */
export function nestedTermIds(matcher: TermMatcher, text: string, ownTermId: string): string[] {
  const ids = new Set<string>();
  for (const m of matchText(matcher, text).matches) {
    if (m.termId !== ownTermId) ids.add(m.termId);
  }
  return [...ids];
}
