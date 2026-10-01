export interface Normalized {
  text: string;
  /** toRaw[i] = index in the raw string of normalized char i. Length text.length + 1. */
  toRaw: number[];
}

const REMOVED = /[\u00AD\u200B-\u200D\uFEFF]/u;
const LETTER = /\p{L}/u;
const LOWER = /\p{Ll}/u;
const SPACE = /\s/u;
const QUOTES: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u201F": '"',
};

// Hot-loop character tests: plain comparisons for ASCII, regexes only beyond it.
const isHyphen = (c: string) => c === "-" || c === "\u2010" || c === "\u2011";
const isSpace = (c: string) =>
  c.charCodeAt(0) < 0x80
    ? c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f" || c === "\v"
    : SPACE.test(c);

/** Lowercases one code point, keeping it unchanged if lowercasing would change its length. */
function foldChar(c: string): string {
  const code = c.charCodeAt(0);
  if (code < 0x80) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : c;
  const lower = c.toLowerCase();
  return lower.length === c.length ? lower : c;
}

/**
 * Normalizes page text for matching while tracking, for every output UTF-16 unit, the index of
 * the raw character it came from. See PLAN.md §5.2 for the steps.
 *
 * Case folding only lowercases a character when that keeps its length, so the folded and cased
 * results of the same raw string always have equal length and aligned offsets.
 */
export function normalize(raw: string, opts: { caseSensitive: boolean }): Normalized {
  // Work on code points; `rs[k]` is the raw index of code point `cps[k]`.
  let cps: string[] = [];
  let rs: number[] = [];

  // 1–2. NFKC per character; drop soft hyphens and zero-width characters.
  for (let i = 0; i < raw.length;) {
    const cp = raw.codePointAt(i)!;
    if (cp < 0x80) {
      // ASCII is NFKC-stable and contains no removed characters.
      cps.push(raw[i]!);
      rs.push(i);
      i++;
      continue;
    }
    const ch = String.fromCodePoint(cp);
    for (const out of ch.normalize("NFKC")) {
      if (REMOVED.test(out)) continue;
      cps.push(out);
      rs.push(i);
    }
    i += ch.length;
  }

  // 3. Dehyphenate across line breaks: letter, hyphen, [spaces] \n [spaces], lowercase letter.
  {
    const outC: string[] = [];
    const outR: number[] = [];
    for (let k = 0; k < cps.length; k++) {
      const c = cps[k]!;
      if (isHyphen(c) && k > 0 && LETTER.test(cps[k - 1]!)) {
        const next = skipLineBreak(cps, k + 1);
        if (next !== -1 && next < cps.length && LOWER.test(cps[next]!)) {
          k = next - 1;
          continue;
        }
      }
      outC.push(c);
      outR.push(rs[k]!);
    }
    cps = outC;
    rs = outR;
  }

  // 4–6. Collapse whitespace, ASCII quotes, case fold; expand to UTF-16 units.
  let text = "";
  const toRaw: number[] = [];
  let prevSpace = false;
  for (let k = 0; k < cps.length; k++) {
    let c = cps[k]!;
    if (isSpace(c)) {
      if (prevSpace) continue;
      prevSpace = true;
      c = " ";
    } else {
      prevSpace = false;
      if (c.charCodeAt(0) >= 0x80) c = QUOTES[c] ?? c;
      if (!opts.caseSensitive) c = foldChar(c);
    }
    text += c;
    for (let u = 0; u < c.length; u++) toRaw.push(rs[k]!);
  }
  toRaw.push(raw.length);
  return { text, toRaw };
}

/** From `start`, skips inline spaces, one "\n", inline spaces. Returns the next index or -1. */
function skipLineBreak(cps: string[], start: number): number {
  let k = start;
  while (k < cps.length && cps[k] !== "\n" && isSpace(cps[k]!)) k++;
  if (cps[k] !== "\n") return -1;
  k++;
  while (k < cps.length && cps[k] !== "\n" && isSpace(cps[k]!)) k++;
  return k;
}

/**
 * Maps a normalized range [start, end) to a raw range [rawStart, rawEnd). The end is placed just
 * after the raw character that produced normalized char `end - 1`, so removed characters that
 * follow it (e.g. a line-break hyphen) are not included.
 */
export function normRangeToRaw(
  n: Normalized,
  raw: string,
  start: number,
  end: number,
): [number, number] {
  const rawStart = n.toRaw[start]!;
  if (end <= start) return [rawStart, rawStart];
  const last = n.toRaw[end - 1]!;
  const cp = raw.codePointAt(last)!;
  return [rawStart, last + (cp > 0xffff ? 2 : 1)];
}
