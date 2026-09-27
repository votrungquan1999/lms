/**
 * Returns the correct English form of a regular noun for a count, e.g.
 * `pluralize(1, "student")` -> "student", `pluralize(3, "student")` -> "students".
 * @param count - The number the word is describing.
 * @param singular - The word's singular form.
 * @returns The singular form when `count` is 1, otherwise the plural form.
 */
export function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
