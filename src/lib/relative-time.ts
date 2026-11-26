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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Names how long ago something happened ("just now", "5 minutes ago",
 * "2 hours ago", "3 days ago"), in whole elapsed periods so the answer does
 * not depend on a time zone.
 * @param from - When it happened.
 * @param now - The current time.
 */
export function relativeTimeAgo(from: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(elapsed / DAY_MS);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
