import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "../settings";

describe("parseSettings", () => {
  it("returns defaults for missing or malformed data", () => {
    for (const json of [null, "", "nope", "42", "null", "[]"]) {
      expect(parseSettings(json)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("keeps valid values and replaces invalid ones with defaults", () => {
    const json = JSON.stringify({
      inflection: false,
      onlyAfterFirstDefinition: "yes",
      showUnderlines: false,
      underlineColor: "red; background: url(x)",
      extra: 1,
    });
    expect(parseSettings(json)).toEqual({
      ...DEFAULT_SETTINGS,
      inflection: false,
      showUnderlines: false,
    });
  });

  it("accepts a hex underline colour", () => {
    expect(parseSettings('{"underlineColor":"#AA3300"}').underlineColor).toBe("#AA3300");
  });
});
