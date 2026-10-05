/** A stretch of selected text in one font style. */
export interface StyledRun {
  text: string;
  italic: boolean;
  bold: boolean;
}

export interface TermSuggestion {
  /** Empty when nothing could be guessed. */
  term: string;
  confidence: "high" | "low";
}

const MAX_WORDS = 5;
const T = String.raw`(?<t>\p{L}[\p{L}\p{N}'’ -]{0,39}?)`;
/** The thing being described before the term, e.g. "a space" in "we say that a space is …". */
const SUBJECT = String.raw`\p{L}[\p{L}\p{N}'’ -]{0,39}?`;
/** What follows a term in a conditional definition. */
const END = String.raw`(?= (?:if|when|whenever|provided)\b|[.,;:]|$)`;

/** Explicit phrasings, tried in order; `high` marks unambiguous ones. */
const PATTERNS: { re: RegExp; confidence: TermSuggestion["confidence"] }[] = [
  // "Definition 2.3 (Compact space)."
  {
    re: new RegExp(String.raw`\b(?:Definition|Def\.)\s*[\d.]*\s*\(${T}\)`, "iu"),
    confidence: "high",
  },
  // "We say that a space is compact if …"
  {
    re: new RegExp(
      String.raw`\bwe say (?:that )?(?:an? |the )?${SUBJECT} is (?:an? |the )?${T}${END}`,
      "iu",
    ),
    confidence: "high",
  },
  // "We call the map an isomorphism if …"
  {
    re: new RegExp(
      String.raw`\bwe call (?:an? |the |such (?:an? )?)?${SUBJECT} (?:an? |the )${T}${END}`,
      "iu",
    ),
    confidence: "high",
  },
  // "Such a space is called compact if …"
  {
    re: new RegExp(String.raw`\bis called (?:an? |the )?${T}${END}`, "iu"),
    confidence: "high",
  },
  // "A compact space is a topological space …"
  {
    re: new RegExp(
      String.raw`(?:^|[.:;]\s+|\s)(?:an?|the) ${T} is (?:a|an|the|said to be)\b`,
      "iu",
    ),
    confidence: "low",
  },
  // PLAN.md §6.4's broader form, e.g. "We call a ring R Noetherian if …" gives "ring R Noetherian".
  {
    re: new RegExp(String.raw`\bwe (?:say|call) (?:that )?(?:an? |the )?${T} (?:is|if)\b`, "iu"),
    confidence: "low",
  },
];

/** Lead words of a definition heading, which are often bold but never the term. */
const HEADING =
  /^(?:definitions?|def|theorem|thm|lemma|proposition|prop|corollary|cor|notation|remark|example|proof)\b[\s\d.:)(-]*$/iu;

/** Trims whitespace, punctuation and a leading article; returns "" unless it is 1–5 words. */
export function cleanCandidate(text: string): string {
  const t = text
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“‘(]+|[\s"'”’),.;:!?]+$/gu, "")
    .replace(/^(?:an?|the) /iu, "");
  if (!/\p{L}/u.test(t)) return "";
  const words = t.split(" ").length;
  return words >= 1 && words <= MAX_WORDS ? t : "";
}

/** Merges adjacent runs with the same style. */
function mergeRuns(runs: readonly StyledRun[]): StyledRun[] {
  const merged: StyledRun[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && last.italic === run.italic && last.bold === run.bold) {
      merged[merged.length - 1] = { ...last, text: last.text + run.text };
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

/**
 * Heuristic 1: the first italic or bold run of 1–5 words that isn't a heading like "Lemma 2" or a
 * single letter.
 */
export function suggestFromRuns(runs: readonly StyledRun[]): string {
  for (const run of mergeRuns(runs)) {
    if (!run.italic && !run.bold) continue;
    if (HEADING.test(run.text.trim())) continue;
    const term = cleanCandidate(run.text);
    // Single letters are usually italic math variables ("a space X"), not terms.
    if (term.replace(/\P{L}/gu, "").length >= 2) return term;
  }
  return "";
}

/** Heuristic 2: explicit definitional phrasing. */
export function suggestFromPatterns(text: string): TermSuggestion | null {
  const flat = text.replace(/\s+/g, " ").trim();
  for (const { re, confidence } of PATTERNS) {
    const term = cleanCandidate(re.exec(flat)?.groups?.t ?? "");
    if (term) return { term, confidence };
  }
  return null;
}

/**
 * Guesses the defined term in a selection (PLAN.md §6.4): a styled run, else a definitional
 * pattern, else nothing.
 */
export function suggestTerm(text: string, runs?: readonly StyledRun[]): TermSuggestion {
  const styled = runs ? suggestFromRuns(runs) : "";
  if (styled) return { term: styled, confidence: "high" };
  return suggestFromPatterns(text) ?? { term: "", confidence: "low" };
}
