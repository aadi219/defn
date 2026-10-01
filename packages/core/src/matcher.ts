import type { Token } from "./tokenize";

export interface Pattern {
  termId: string;
  tokens: string[];
  caseSensitive: boolean;
  /** Higher wins when two patterns have the same token sequence. Default 0. */
  priority?: number;
}
export interface Match {
  termId: string;
  start: number;
  end: number;
} // normalized offsets

export interface MatcherOptions {
  /** Also match simple plural/singular variants of a pattern's last token. Default true. */
  inflection?: boolean;
}

interface Node {
  /** Created on first child; most nodes are leaves. */
  children?: Map<string, Node>;
  termId?: string;
  /** priority * 2 + (exact ? 1 : 0): exact patterns beat inflected variants of equal priority. */
  rank: number;
}

const MIN_INFLECT_LENGTH = 3;

function newNode(): Node {
  return { rank: -Infinity };
}

function child(node: Node, token: string): Node {
  node.children ??= new Map();
  let next = node.children.get(token);
  if (!next) node.children.set(token, (next = newNode()));
  return next;
}

/** Variants of a last token: itself (exact), plus +s, +es, and minus a trailing s. */
function lastTokenVariants(token: string, inflection: boolean): [string, boolean][] {
  const variants: [string, boolean][] = [[token, true]];
  if (!inflection || token.length < MIN_INFLECT_LENGTH) return variants;
  variants.push([token + "s", false], [token + "es", false]);
  if (token.endsWith("s")) variants.push([token.slice(0, -1), false]);
  return variants;
}

/**
 * Token trie matcher: longest match, left to right, non-overlapping (PLAN.md §5.4). Case-sensitive
 * and case-insensitive patterns live in separate tries; on equal match length the case-sensitive
 * one wins.
 */
export class TermMatcher {
  private readonly folded = newNode();
  private readonly cased = newNode();

  constructor(patterns: Pattern[], options: MatcherOptions = {}) {
    const inflection = options.inflection ?? true;
    for (const p of patterns) {
      if (p.tokens.length === 0) continue;
      const root = p.caseSensitive ? this.cased : this.folded;
      const priority = p.priority ?? 0;
      let prefix = root;
      for (let i = 0; i < p.tokens.length - 1; i++) prefix = child(prefix, p.tokens[i]!);
      for (const [last, exact] of lastTokenVariants(p.tokens.at(-1)!, inflection)) {
        if (last.length === 0) continue;
        const node = child(prefix, last);
        const rank = priority * 2 + (exact ? 1 : 0);
        if (rank > node.rank) {
          node.rank = rank;
          node.termId = p.termId;
        }
      }
    }
  }

  /** tokensFolded / tokensCased are tokenizations of the two normalized page strings. */
  find(tokensFolded: Token[], tokensCased: Token[]): Match[] {
    const matches: Match[] = [];
    let c = 0; // index into tokensCased, kept aligned with i by start offset
    for (let i = 0; i < tokensFolded.length;) {
      const start = tokensFolded[i]!.start;
      while (c < tokensCased.length && tokensCased[c]!.start < start) c++;

      const f = longest(this.folded, tokensFolded, i);
      const k = tokensCased[c]?.start === start ? longest(this.cased, tokensCased, c) : undefined;
      const best = k && (!f || k.end >= f.end) ? k : f;

      if (!best) {
        i++;
        continue;
      }
      matches.push({ termId: best.termId, start, end: best.end });
      while (i < tokensFolded.length && tokensFolded[i]!.start < best.end) i++;
    }
    return matches;
  }
}

function longest(
  root: Node,
  tokens: Token[],
  from: number,
): { termId: string; end: number } | undefined {
  let node: Node | undefined = root;
  let found: { termId: string; end: number } | undefined;
  for (let j = from; j < tokens.length; j++) {
    node = node.children?.get(tokens[j]!.text);
    if (!node) break;
    if (node.termId !== undefined) found = { termId: node.termId, end: tokens[j]!.end };
  }
  return found;
}
