import { describe, expect, it } from "vitest";
import { styleFromFontName } from "../fontStyle";

describe("styleFromFontName", () => {
  it.each([
    ["Times-Roman", false, false],
    ["Times-Italic", true, false],
    ["Times-BoldItalic", true, true],
    ["Helvetica-Oblique", true, false],
    ["Helvetica-Bd", false, true],
    ["ABCDEF+MinionPro-It", true, false],
    ["MinionPro-BoldIt", true, true],
    ["ABCDEF+CMTI10", true, false],
    ["ABCDEF+CMBX12", false, true],
    ["ABCDEF+CMMI10", false, false],
    ["ABCDEF+CMR10", false, false],
    ["Font-Itc", false, false],
  ])("%s", (name, italic, bold) => {
    expect(styleFromFontName(name)).toEqual({ italic, bold });
  });
});
