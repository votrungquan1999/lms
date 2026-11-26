import { relativeDay } from "src/lib/relative-time";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-06-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("relativeDay", () => {
  it("counts whole elapsed 24-hour periods", () => {
    expect(relativeDay(hoursAgo(23), NOW)).toBe("today");
    expect(relativeDay(hoursAgo(24), NOW)).toBe("yesterday");
    expect(relativeDay(hoursAgo(47), NOW)).toBe("yesterday");
    expect(relativeDay(hoursAgo(72), NOW)).toBe("3 days ago");
  });

  it("reads a time in the future as today", () => {
    expect(relativeDay(hoursAgo(-2), NOW)).toBe("today");
  });
});
