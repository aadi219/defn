import { describe, expect, it } from "vitest";
import type { Occurrence } from "../occurrences";
import { orderOccurrences, stepOccurrence } from "../occurrenceNav";

const occ = (termId: string, start: number, left: number, top: number): Occurrence => ({
  termId,
  start,
  end: start + 3,
  rects: [{ left, top, width: 10, height: 5 }],
});

const items = orderOccurrences(
  new Map([
    [3, [occ("c", 0, 0, 10)]],
    [1, [occ("b", 20, 50, 10), occ("a", 0, 10, 10), occ("z", 40, 0, 30)]],
  ]),
);
const ids = (xs: { occurrence: Occurrence }[]) => xs.map((x) => x.occurrence.termId);

describe("orderOccurrences", () => {
  it("orders by page, line, then left", () => {
    expect(ids(items)).toEqual(["a", "b", "z", "c"]);
  });

  it("skips occurrences without rects", () => {
    expect(orderOccurrences([[1, [{ termId: "x", start: 0, end: 1, rects: [] }]]])).toEqual([]);
  });
});

describe("stepOccurrence", () => {
  it("moves from the current occurrence, wrapping around", () => {
    const b = items[1]!;
    expect(stepOccurrence(items, b, 1, 1)?.occurrence.termId).toBe("z");
    expect(stepOccurrence(items, b, 1, -1)?.occurrence.termId).toBe("a");
    expect(stepOccurrence(items, items[3]!, 3, 1)?.occurrence.termId).toBe("a");
    expect(stepOccurrence(items, items[0]!, 1, -1)?.occurrence.termId).toBe("c");
  });

  it("starts from the current page when nothing is open", () => {
    expect(stepOccurrence(items, null, 2, 1)?.occurrence.termId).toBe("c");
    expect(stepOccurrence(items, null, 2, -1)?.occurrence.termId).toBe("z");
    expect(stepOccurrence(items, null, 4, 1)?.occurrence.termId).toBe("a");
    expect(stepOccurrence(items, null, 0, -1)?.occurrence.termId).toBe("c");
  });

  it("returns undefined when there are none", () => {
    expect(stepOccurrence([], null, 1, 1)).toBeUndefined();
  });
});
