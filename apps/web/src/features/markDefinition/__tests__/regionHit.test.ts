import { describe, expect, it } from "vitest";
import type { Definition, PdfRect } from "@deflink/core";
import type { PointConverter } from "@deflink/viewer";
import { definitionsAt } from "../regionHit";

// Page 1000 units tall at scale 2: CSS y = (1000 - pdf y) * 2.
const viewport = {
  convertToViewportPoint: (x: number, y: number) => [x * 2, (1000 - y) * 2],
  convertToPdfPoint: (x: number, y: number) => [x / 2, 1000 - y / 2],
} as unknown as PointConverter;

function def(id: string, ...rects: PdfRect[]): Definition {
  return {
    id,
    termId: "t",
    kind: "definition",
    docId: "D",
    page: 1,
    rects,
    text: "",
    cropId: id,
    createdAt: 0,
  };
}

describe("definitionsAt", () => {
  const a = def("a", { x1: 10, y1: 900, x2: 110, y2: 910 }, { x1: 10, y1: 880, x2: 60, y2: 890 });
  const b = def("b", { x1: 50, y1: 880, x2: 200, y2: 890 });

  it("finds definitions under the point, on any line", () => {
    expect(definitionsAt([a, b], viewport, 40, 190).map((d) => d.id)).toEqual(["a"]);
    expect(definitionsAt([a, b], viewport, 110, 230).map((d) => d.id)).toEqual(["a", "b"]);
    expect(definitionsAt([a, b], viewport, 450, 230)).toEqual([]);
  });
});
