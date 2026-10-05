import { describe, expect, it } from "vitest";
import { EMPTY_STACK, move, parseStack, pin, unpin, type StackState } from "../stackState";

const stack = (ids: string[], trail = ids): StackState => ({ ids, trail });

describe("pin", () => {
  it("appends to the bottom and the trail", () => {
    expect(pin(pin(EMPTY_STACK, "a"), "b")).toEqual(stack(["a", "b"]));
  });

  it("inserts directly below the given card", () => {
    expect(pin(stack(["a", "b"]), "c", "a")).toEqual(stack(["a", "c", "b"], ["a", "b", "c"]));
  });

  it("appends when the anchor is not pinned", () => {
    expect(pin(stack(["a"]), "c", "zz").ids).toEqual(["a", "c"]);
  });

  it("leaves the stack unchanged when already pinned", () => {
    const s = stack(["a", "b"]);
    expect(pin(s, "a", "b")).toBe(s);
  });
});

describe("unpin", () => {
  it("removes from cards and trail", () => {
    expect(unpin(stack(["a", "b", "c"], ["c", "a", "b"]), "a")).toEqual(
      stack(["b", "c"], ["c", "b"]),
    );
  });

  it("ignores ids that are not pinned", () => {
    const s = stack(["a"]);
    expect(unpin(s, "x")).toBe(s);
  });
});

describe("move", () => {
  it("moves up and down without touching the trail", () => {
    const s = stack(["a", "b", "c"]);
    expect(move(s, "c", -1)).toEqual(stack(["a", "c", "b"], ["a", "b", "c"]));
    expect(move(s, "a", 1).ids).toEqual(["b", "a", "c"]);
  });

  it("is a no-op at the ends or for unknown ids", () => {
    const s = stack(["a", "b"]);
    expect(move(s, "a", -1)).toBe(s);
    expect(move(s, "b", 1)).toBe(s);
    expect(move(s, "x", 1)).toBe(s);
  });
});

describe("parseStack", () => {
  it("round-trips a stack", () => {
    const s = stack(["a", "b"], ["b", "a"]);
    expect(parseStack(JSON.stringify(s))).toEqual(s);
  });

  it("returns an empty stack for missing or malformed data", () => {
    for (const json of [null, "", "not json", "42", "null", '{"ids":"a"}']) {
      expect(parseStack(json)).toEqual(EMPTY_STACK);
    }
  });

  it("drops non-strings and duplicates, and repairs the trail", () => {
    expect(parseStack('{"ids":["a",1,"b","a"],"trail":["b","x","b"]}')).toEqual(
      stack(["a", "b"], ["b", "a"]),
    );
  });
});
