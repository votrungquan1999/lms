import { normalizeText } from "src/lib/text-normalization";

/**
 * Counts how many lines differ between two texts, the way the side-by-side
 * diff marks them: a line changed in place counts once, an added or removed
 * line counts once. Line endings and trailing spaces are ignored.
 */
export function lineDiffCount(before: string, after: string): number {
  const a = toLines(before);
  const b = toLines(after);
  const common = longestCommonLines(a, b);
  return Math.max(a.length - common, b.length - common);
}

/** Splits into lines, treating a trailing newline as the end of the last line. */
function toLines(text: string): string[] {
  const normalized = normalizeText(text);
  if (normalized === "") {
    return [];
  }
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** How many lines the two texts share in the same order, gaps allowed (longest common subsequence). */
function longestCommonLines(a: string[], b: string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const lineA of a) {
    const current = new Array<number>(b.length + 1).fill(0);
    b.forEach((lineB, j) => {
      current[j + 1] =
        lineA === lineB
          ? (previous[j] ?? 0) + 1
          : Math.max(previous[j + 1] ?? 0, current[j] ?? 0);
    });
    previous = current;
  }
  return previous[b.length] ?? 0;
}
