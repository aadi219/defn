import { describe, expect, it } from "vitest";
import { buildPageTextFromDom } from "../src/pageText";

/** A minimal fake text-layer span: text, client rect, optional following <br>. */
function span(text: string, left: number, bottom: number, opts: { br?: boolean } = {}) {
  const node = { nodeType: 3, data: text };
  return {
    firstChild: node,
    nextSibling: opts.br ? { nodeName: "BR" } : null,
    querySelector: () => null,
    getBoundingClientRect: () => ({ left, bottom, width: text.length * 5, height: 10 }),
  };
}

/** A container span (e.g. PDF.js `markedContent`) that wraps other spans. */
const wrapper = { firstChild: null, querySelector: () => ({}) };

function layer(spans: unknown[]): Element {
  return { querySelectorAll: () => spans } as unknown as Element;
}

describe("buildPageTextFromDom", () => {
  it("joins leaf spans with separators from their geometry", () => {
    const spans = [
      wrapper,
      span("com", 0, 100),
      span("pact", 15, 100),
      span("space", 45, 100, { br: true }),
      span("next", 0, 130),
    ];
    const text = buildPageTextFromDom(2, layer(spans));
    expect(text.page).toBe(2);
    expect(text.raw).toBe("compact space\nnext");
    expect(text.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 3],
      [3, 7],
      [8, 13],
      [14, 18],
    ]);
    expect(text.segments[0]!.node).toBe(spans[1]!.firstChild);
  });

  it("starts a new line on a vertical jump without <br>", () => {
    expect(buildPageTextFromDom(1, layer([span("a", 0, 100), span("b", 0, 120)])).raw).toBe("a\nb");
  });
});
