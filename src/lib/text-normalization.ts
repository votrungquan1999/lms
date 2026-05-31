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
