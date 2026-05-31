/**
 * Normalizes free-text/code so that whitespace-only differences do not show up
 * as real changes in a line diff. Converts all line endings (`\r\n` and lone
 * `\r`) to `\n` and strips trailing whitespace from each line. Leading
 * whitespace (indentation) and blank lines are preserved, since those are
 * meaningful in code.
 *
 * Used both at display time (the student-vs-solution diff view) and at the AI
 * solution write path, so a CRLF student answer and an LF AI solution that are
 * otherwise identical compare as equal.
 *
 * @param value - The raw text to normalize.
 * @returns The text with `\n` line endings and no trailing per-line whitespace.
 */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
}

/**
 * Reports whether two texts are equal once normalized, i.e. they differ only in
 * line endings and trailing per-line whitespace. Used to decide whether a
 * student-vs-solution diff is worth showing — when equivalent, there is no real
 * difference to display.
 *
 * @param a - First text to compare.
 * @param b - Second text to compare.
 * @returns `true` when the two texts are equal after normalization.
 */
export function isTextEquivalent(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}
