import { describe, expect, it } from "vitest";
import { TermMatcher, type Pattern } from "../src/matcher";
import { tokenize } from "../src/tokenize";
import { pick, rng } from "./rng";

// Timing budgets (PLAN.md §5.4). Excluded from coverage runs, where instrumentation skews timings.
describe("TermMatcher performance", () => {
  it("is fast: 5,000 patterns over a 10,000-token page in under 50 ms", () => {
    const r = rng(42);
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const vocab = Array.from({ length: 3000 }, () => {
      let w = "";
      const len = 3 + Math.floor(r() * 8);
      for (let i = 0; i < len; i++) w += pick(r, [...letters]);
      return w;
    });
    const patterns: Pattern[] = Array.from({ length: 5000 }, (_, i) => ({
      termId: `t${i}`,
      tokens: Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(r, vocab)),
      caseSensitive: i % 10 === 0,
    }));
    const page = Array.from({ length: 10_000 }, () => pick(r, vocab)).join(" ");
    const tokens = tokenize(page);
    expect(tokens).toHaveLength(10_000);

    const m = new TermMatcher(patterns);
    m.find(tokens, tokens); // warm up the JIT
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const t0 = performance.now();
      m.find(tokens, tokens);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(50);
  });
});
