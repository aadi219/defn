import { describe, expect, it } from "vitest";
import { normalize, normRangeToRaw } from "../src/normalize";
import { pick, rng } from "./rng";

const fold = (s: string) => normalize(s, { caseSensitive: false });
const cased = (s: string) => normalize(s, { caseSensitive: true });

describe("normalize", () => {
  it("splits ligatures and maps every output char to the ligature", () => {
    const n = fold("a \uFB01nite \uFB02ow");
    expect(n.text).toBe("a finite flow");
    expect(n.toRaw.slice(2, 5)).toEqual([2, 2, 3]);
    expect(n.toRaw).toHaveLength(n.text.length + 1);
    expect(n.toRaw.at(-1)).toBe(11);
  });

  it("removes soft hyphens and zero-width characters", () => {
    expect(fold("com\u00ADpact\u200B \uFEFFspace\u200D").text).toBe("compact space");
  });

  it("dehyphenates a line-break hyphen before a lowercase letter", () => {
    const raw = "com-\npact space";
    const n = fold(raw);
    expect(n.text).toBe("compact space");
    expect(raw[n.toRaw[3]!]).toBe("p");
  });

  it("dehyphenates with spaces around the line break and Unicode hyphens", () => {
    expect(fold("com- \n  pact").text).toBe("compact");
    expect(fold("com\u2010\npact").text).toBe("compact");
    expect(fold("com\u2011\npact").text).toBe("compact");
  });

  it("keeps the hyphen before an uppercase letter or digit, or after a non-letter", () => {
    expect(cased("Hausdorff-\nSpace").text).toBe("Hausdorff- Space");
    expect(fold("type-\n2 error").text).toBe("type- 2 error");
    expect(fold("1-\nform").text).toBe("1- form");
  });

  it("keeps an in-line hyphen", () => {
    expect(fold("well-defined").text).toBe("well-defined");
  });

  it("collapses whitespace runs and newlines to one space", () => {
    const n = fold("a \t\n  b\n\nc");
    expect(n.text).toBe("a b c");
    expect(n.toRaw.slice(0, 4)).toEqual([0, 1, 6, 7]);
  });

  it("maps curly quotes to ASCII", () => {
    expect(fold("\u201Cit\u2019s\u201D \u2018x\u2019").text).toBe("\"it's\" 'x'");
  });

  it("case folds unless case sensitive", () => {
    expect(fold("Compact Space").text).toBe("compact space");
    expect(cased("Compact Space").text).toBe("Compact Space");
  });

  it("keeps folded and cased output the same length", () => {
    const raw = "\u0130stanbul \u01C5 Stra\u00DFe \uFB01";
    expect(fold(raw).text.length).toBe(cased(raw).text.length);
    expect(fold(raw).toRaw).toEqual(cased(raw).toRaw);
  });

  it("handles astral code points", () => {
    const raw = "x \u{1D400} y";
    const n = fold(raw);
    expect(n.text).toBe("x a y"); // NFKC maps mathematical bold A to A
    expect(normRangeToRaw(n, raw, 2, 3)).toEqual([2, 4]);
  });
});

describe("normRangeToRaw", () => {
  it("excludes a trailing removed line-break hyphen", () => {
    const raw = "com-\npact";
    const n = fold(raw);
    expect(normRangeToRaw(n, raw, 0, 3)).toEqual([0, 3]);
    expect(normRangeToRaw(n, raw, 0, 7)).toEqual([0, 9]);
  });

  it("returns an empty range for an empty selection", () => {
    const n = fold("abc");
    expect(normRangeToRaw(n, "abc", 1, 1)).toEqual([1, 1]);
  });
});

describe("normalize offset map (property)", () => {
  const alphabet = [
    "a",
    "b",
    "e",
    "s",
    "A",
    "S",
    "1",
    " ",
    " ",
    "  ",
    "\n",
    "\t",
    "-",
    "\u2010",
    "-\n",
    "- \n ",
    "\uFB01",
    "\uFB02",
    "\u00AD",
    "\u200B",
    "\uFEFF",
    "\u2019",
    "\u201C",
    ".",
    ",",
    "\u00E9",
    "\u{1D400}",
    "\u0130",
  ];

  for (const caseSensitive of [false, true]) {
    it(`round-trips substrings on clean boundaries (caseSensitive=${caseSensitive})`, () => {
      const r = rng(caseSensitive ? 2 : 1);
      for (let iter = 0; iter < 500; iter++) {
        let raw = "";
        const len = 1 + Math.floor(r() * 40);
        for (let i = 0; i < len; i++) raw += pick(r, alphabet);
        const n = normalize(raw, { caseSensitive });

        // Clean boundary: not inside a multi-unit expansion of one raw character.
        const clean: number[] = [];
        for (let k = 0; k <= n.text.length; k++) {
          if (k === 0 || k === n.text.length || n.toRaw[k]! > n.toRaw[k - 1]!) clean.push(k);
        }
        for (let t = 0; t < 10; t++) {
          let s = pick(r, clean);
          let e = pick(r, clean);
          if (s > e) [s, e] = [e, s];
          const [rs, re] = normRangeToRaw(n, raw, s, e);
          const again = normalize(raw.slice(rs, re), { caseSensitive }).text;
          expect(again, JSON.stringify({ raw, s, e })).toBe(n.text.slice(s, e));
        }
      }
    });
  }
});
