import { formatVietnamDate } from "src/lib/format-date";
import { describe, expect, it } from "vitest";

describe("formatVietnamDate", () => {
  it("shows a UTC evening as the next day in Vietnam", () => {
    expect(formatVietnamDate(new Date("2026-09-02T18:30:00Z"))).toBe(
      "3 Sep 2026",
    );
  });

  it("keeps a UTC morning on the same day", () => {
    expect(formatVietnamDate(new Date("2026-09-12T10:00:00Z"))).toBe(
      "12 Sep 2026",
    );
  });
});
