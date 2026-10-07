import { describe, expect, it } from "vitest";
import { textLayerChangePage } from "../src/readerBridge";

/** A minimal fake element: its classes, and the ancestors `closest` can find (itself included). */
function el(className: string, ancestors: Record<string, unknown> = {}): Element {
  const self = {
    nodeType: 1,
    classList: { contains: (name: string) => className.split(" ").includes(name) },
    closest: (selector: string) =>
      selector === `.${className}` ? self : (ancestors[selector] ?? null),
  };
  return self as unknown as Element;
}

const page = (n: number) => ({ dataset: { pageNumber: String(n) } });

function record(
  type: "childList" | "attributes",
  target: Element,
  added: unknown[] = [],
  removed: unknown[] = [],
): MutationRecord {
  return { type, target, addedNodes: added, removedNodes: removed } as unknown as MutationRecord;
}

describe("textLayerChangePage", () => {
  const pageEl = el("page", {});
  (pageEl as unknown as { dataset: unknown }).dataset = page(3).dataset;
  const textLayer = el("textLayer", { ".page": page(3) });

  it("reports a text layer attached to or removed from its page", () => {
    expect(textLayerChangePage(record("childList", pageEl, [textLayer]))).toBe(3);
    expect(textLayerChangePage(record("childList", pageEl, [], [textLayer]))).toBe(3);
  });

  it("reports a text layer shown or hidden", () => {
    expect(textLayerChangePage(record("attributes", textLayer))).toBe(3);
  });

  it("reports content changes inside a text layer", () => {
    expect(textLayerChangePage(record("childList", textLayer, [el("markedContent")]))).toBe(3);
  });

  it("ignores PDF.js moving .endOfContent on selection changes", () => {
    const end = el("endOfContent", { ".textLayer": textLayer, ".page": page(3) });
    expect(textLayerChangePage(record("childList", textLayer, [end], [end]))).toBeNull();
  });

  it("ignores other layers, including Defn's own overlay", () => {
    expect(textLayerChangePage(record("childList", pageEl, [el("defn-overlay")]))).toBeNull();
    expect(textLayerChangePage(record("attributes", el("annotationLayer")))).toBeNull();
  });
});
