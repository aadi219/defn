import { describe, expect, it } from "vitest";
import type { Term } from "../src/model";
import { buildMatcherForDocument } from "../src/termIndex";
import { pick, rng } from "./rng";

function term(id: number, label: string, overrides: Partial<Term>): Term {
  return {
    id: `t${id}`,
    label,
    aliases: [],
    caseSensitive: false,
    scope: { type: "global" },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// Timing budgets (PLAN.md §5.5). Excluded from coverage runs, where instrumentation skews timings.
describe("buildMatcherForDocument performance", () => {
  it("rebuilds for 5,000 terms in under 20 ms", () => {
    const r = rng(7);
    const letters = [..."abcdefghijklmnopqrstuvwxyz"];
    const word = () =>
      Array.from({ length: 4 + Math.floor(r() * 6) }, () => pick(r, letters)).join("");
    const terms = Array.from({ length: 5000 }, (_, i) =>
      term(i, Array.from({ length: 1 + Math.floor(r() * 3) }, word).join(" "), {
        aliases: i % 3 === 0 ? [word()] : [],
        scope: i % 2 ? { type: "global" } : { type: "document", docId: "docA" },
      }),
    );
    buildMatcherForDocument(terms, "docA"); // warm up the JIT
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const t0 = performance.now();
      buildMatcherForDocument(terms, "docA");
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(20);
  });
});
