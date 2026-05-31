import { describe, expect, it } from "vitest";
import { isTextEquivalent, normalizeText } from "../text-normalization";

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

describe("isTextEquivalent", () => {
  it("treats two strings differing only in line endings and trailing whitespace as equivalent", () => {
    const student = "def total(nums):  \r\n    return sum(nums)\r\n";
    const solution = "def total(nums):\n    return sum(nums)\n";
    expect(isTextEquivalent(student, solution)).toBe(true);
  });

  it("treats strings with different content as not equivalent", () => {
    const student = "def total(nums):\n    return 0\n";
    const solution = "def total(nums):\n    return sum(nums)\n";
    expect(isTextEquivalent(student, solution)).toBe(false);
  });
});
