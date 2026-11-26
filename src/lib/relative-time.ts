const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Names how long ago something happened in whole elapsed 24-hour periods
 * ("today", "yesterday", "3 days ago"). Elapsed periods rather than calendar
 * days, so the answer does not depend on a time zone.
 * @param from - When it happened.
 * @param now - The current time.
 */
export function relativeDay(from: Date, now: Date): string {
  const days = Math.max(
    0,
    Math.floor((now.getTime() - from.getTime()) / DAY_MS),
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
