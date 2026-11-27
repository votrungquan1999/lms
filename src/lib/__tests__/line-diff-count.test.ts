import { describe, expect, it } from "vitest";
import { lineDiffCount } from "../line-diff-count";

describe("lineDiffCount", () => {
  it("counts a line changed in place once, and ignores line endings and trailing spaces", () => {
    expect(lineDiffCount("a\nb\nc", "a\nB\nc")).toBe(1);
    expect(lineDiffCount("a  \r\nb\r\n", "a\nb\n")).toBe(0);
  });

  it("counts added and removed lines", () => {
    expect(lineDiffCount("a\nb", "a\nb\nc\nd")).toBe(2);
    expect(lineDiffCount("a\nb\nc", "a")).toBe(2);
    expect(lineDiffCount("", "a")).toBe(1);
  });
});
