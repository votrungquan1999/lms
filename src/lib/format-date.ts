const VIETNAM_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

/**
 * Formats a moment as a calendar date in Vietnam time ("3 Sep 2026"). Fixed
 * zone, because the host runs in UTC and would show an evening-UTC event a day early.
 * @param date - The moment to show.
 */
export function formatVietnamDate(date: Date): string {
  const parts = VIETNAM_DATE_PARTS.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  // en-GB spells September "Sept"; en-US parts give a stable "Sep" in day-month-year order.
  return `${part("day")} ${part("month")} ${part("year")}`;
}
