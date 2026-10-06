import { describe, expect, it } from "vitest";
import type { Definition, Term } from "@deflink/core";
import { highlightJSON } from "../src/annotations";

const term: Term = {
  id: "t",
  label: "compact space",
  aliases: [],
  caseSensitive: false,
  scope: { type: "document", docId: "KEY1" },
  createdAt: 0,
  updatedAt: 0,
};
const definition: Definition = {
  id: "d",
  termId: "t",
  kind: "theorem",
  docId: "KEY1",
  page: 3,
  rects: [],
  text: "Every compact space …",
  cropId: "c",
  createdAt: 0,
};

describe("highlightJSON", () => {
  it("mirrors a definition as a tagged highlight at the reader's position", () => {
    const position = { pageIndex: 2, rects: [[10, 20, 30, 40]] };
    expect(
      highlightJSON("ABCD2345", definition, term, {
        pageLabel: "3",
        sortIndex: "00002|000123|00456",
        position,
      }),
    ).toEqual({
      key: "ABCD2345",
      type: "highlight",
      text: "Every compact space …",
      comment: "term: compact space",
      color: "#2ea8e5",
      pageLabel: "3",
      sortIndex: "00002|000123|00456",
      position,
      tags: [{ name: "deflink:theorem" }],
    });
  });

  it("omits a missing page label and sort index", () => {
    const json = highlightJSON("K", definition, term, { position: { pageIndex: 0, rects: [] } });
    expect(json).not.toHaveProperty("pageLabel");
    expect(json).not.toHaveProperty("sortIndex");
  });
});
