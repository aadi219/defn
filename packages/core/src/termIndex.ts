import { TermMatcher, type Match, type MatcherOptions, type Pattern } from "./matcher";
import type { Term } from "./model";
import { normalize, type Normalized } from "./normalize";
import { tokenize } from "./tokenize";

/** All surface forms of a term: label first, then aliases. */
export function surfaceForms(term: Term): string[] {
  return [term.label, ...term.aliases];
}

/** Tokens of a surface form, normalized the way the term will be matched. */
export function patternTokens(surface: string, caseSensitive: boolean): string[] {
  return tokenize(normalize(surface, { caseSensitive }).text).map((t) => t.text);
}

export function isInScope(term: Term, docId: string): boolean {
  return term.scope.type === "global" || term.scope.docId === docId;
}

/**
 * Builds a matcher over the terms visible in `docId`: global terms plus terms scoped to that
 * document. Document-scoped terms win over global ones with the same surface form.
 */
export function buildMatcherForDocument(
  terms: Term[],
  docId: string,
  options: MatcherOptions = {},
): TermMatcher {
  const patterns: Pattern[] = [];
  for (const term of terms) {
    if (!isInScope(term, docId)) continue;
    const priority = term.scope.type === "document" ? 1 : 0;
    for (const surface of surfaceForms(term)) {
      const tokens = patternTokens(surface, term.caseSensitive);
      if (tokens.length > 0) {
        patterns.push({ termId: term.id, tokens, caseSensitive: term.caseSensitive, priority });
      }
    }
  }
  return new TermMatcher(patterns, options);
}

/**
 * Returns a memoized `buildMatcherForDocument`: the matcher is rebuilt only when the terms array
 * (by identity), the document or the options change.
 */
export function createMatcherCache(): typeof buildMatcherForDocument {
  let last: { terms: Term[]; docId: string; inflection: boolean; matcher: TermMatcher } | undefined;
  return (terms, docId, options = {}) => {
    const inflection = options.inflection ?? true;
    if (last && last.terms === terms && last.docId === docId && last.inflection === inflection) {
      return last.matcher;
    }
    const matcher = buildMatcherForDocument(terms, docId, { inflection });
    last = { terms, docId, inflection, matcher };
    return matcher;
  };
}

export interface TextMatches {
  /** Case-folded normalization; match offsets index into it (and into `cased`, same length). */
  folded: Normalized;
  cased: Normalized;
  matches: Match[];
}

/** Normalizes raw text both ways, tokenizes, and runs the matcher. */
export function matchText(matcher: TermMatcher, raw: string): TextMatches {
  const folded = normalize(raw, { caseSensitive: false });
  const cased = normalize(raw, { caseSensitive: true });
  return {
    folded,
    cased,
    matches: matcher.find(tokenize(folded.text), tokenize(cased.text)),
  };
}
