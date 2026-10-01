export interface Token {
  text: string;
  start: number;
  end: number;
} // offsets into normalized text

const TOKEN = /[\p{L}\p{N}]+(?:['\u2019]\p{L}+)?/gu;

/** Splits normalized text into word tokens; punctuation and whitespace separate them. */
export function tokenize(normalized: string): Token[] {
  const tokens: Token[] = [];
  for (const m of normalized.matchAll(TOKEN)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}
