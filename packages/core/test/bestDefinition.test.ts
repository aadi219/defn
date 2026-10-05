import { describe, expect, it } from "vitest";
import { bestDefinition, compareByPosition, type Definition } from "../src";

function def(id: string, docId: string, page: number, y: number, createdAt = 0): Definition {
  return {
    id,
    termId: "t",
    kind: "definition",
    docId,
    page,
    rects: [{ x1: 0, y1: y - 10, x2: 100, y2: y }],
    text: id,
    cropId: id,
    createdAt,
  };
}

describe("compareByPosition", () => {
  it("orders by page, then top to bottom", () => {
    const defs = [def("p2", "D", 2, 700), def("low", "D", 1, 100), def("high", "D", 1, 700)];
    expect(defs.sort(compareByPosition).map((d) => d.id)).toEqual(["high", "low", "p2"]);
  });
});

describe("bestDefinition", () => {
  it("returns undefined for no definitions", () => {
    expect(bestDefinition([], "D")).toBeUndefined();
  });

  it("prefers the earliest definition in the current document", () => {
    const defs = [
      def("other-new", "X", 1, 700, 99),
      def("p3", "D", 3, 700, 50),
      def("p1-low", "D", 1, 100, 1),
      def("p1-high", "D", 1, 600, 2),
    ];
    expect(bestDefinition(defs, "D")?.id).toBe("p1-high");
  });

  it("falls back to the most recently created definition elsewhere", () => {
    const defs = [def("old", "X", 1, 700, 1), def("new", "Y", 5, 100, 9), def("mid", "X", 2, 0, 5)];
    expect(bestDefinition(defs, "D")?.id).toBe("new");
  });
});
