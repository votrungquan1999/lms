import { matchesSearch } from "src/lib/search-text";
import { describe, expect, it } from "vitest";

describe("matchesSearch", () => {
  it("finds a Vietnamese title by its unaccented, lower-case spelling", () => {
    expect(matchesSearch("Kiểm tra Đầu vào", "kiem tra dau vao")).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(matchesSearch("Midterm Quiz", "  QUIZ ")).toBe(true);
  });

  it("matches any part of the text and rejects text that is absent", () => {
    expect(matchesSearch("Midterm Quiz", "term")).toBe(true);
    expect(matchesSearch("Midterm Quiz", "final")).toBe(false);
  });

  it("matches everything for an empty or whitespace-only query", () => {
    expect(matchesSearch("Midterm Quiz", "")).toBe(true);
    expect(matchesSearch("Midterm Quiz", "   ")).toBe(true);
  });
});
