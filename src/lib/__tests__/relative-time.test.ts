import { relativeDay, relativeTimeAgo } from "src/lib/relative-time";
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

describe("relativeTimeAgo", () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

  it("names minutes, hours and days in whole elapsed periods", () => {
    expect(relativeTimeAgo(minutesAgo(0.5), NOW)).toBe("just now");
    expect(relativeTimeAgo(minutesAgo(1), NOW)).toBe("1 minute ago");
    expect(relativeTimeAgo(minutesAgo(59), NOW)).toBe("59 minutes ago");
    expect(relativeTimeAgo(minutesAgo(60), NOW)).toBe("1 hour ago");
    expect(relativeTimeAgo(hoursAgo(23), NOW)).toBe("23 hours ago");
    expect(relativeTimeAgo(hoursAgo(24), NOW)).toBe("1 day ago");
    expect(relativeTimeAgo(hoursAgo(72), NOW)).toBe("3 days ago");
  });

  it("reads a time in the future as just now", () => {
    expect(relativeTimeAgo(hoursAgo(-2), NOW)).toBe("just now");
  });
});
