import { describe, expect, it } from "vitest";
import { normalizeText } from "../text-normalization";

describe("normalizeText", () => {
  it("converts CRLF and lone CR line endings to LF", () => {
    const input = "line1\r\nline2\rline3\n";
    expect(normalizeText(input)).toBe("line1\nline2\nline3\n");
  });

  it("strips trailing spaces and tabs from each line but preserves indentation", () => {
    const input = "def f():  \n    return 1\t\n";
    expect(normalizeText(input)).toBe("def f():\n    return 1\n");
  });
});
