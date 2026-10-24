/**
 * Seconds the parse round-trip took, kept from the first parse reply only.
 * The import's save request carries the same question titles, so it matches the
 * parse route too and must not replace the real figure.
 * @param recorded - The seconds already recorded, if any.
 * @param startedAt - When the parse POST began (ms).
 * @param endedAt - When its reply body was captured (ms).
 * @returns The seconds to report.
 */
export function recordReadSeconds(
  recorded: number | undefined,
  startedAt: number,
  endedAt: number,
): number {
  return recorded ?? Math.round((endedAt - startedAt) / 1000);
}
