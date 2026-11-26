/**
 * Whether `text` contains `query`, ignoring case and accents. Vietnamese names
 * typed without accents must still be found.
 * @param text - The text being searched.
 * @param query - What the teacher typed; empty or whitespace matches everything.
 */
export function matchesSearch(text: string, query: string): boolean {
  const needle = normalize(query);
  if (needle === "") return true;
  return normalize(text).includes(needle);
}

/** Lower-case, accent-free, trimmed text; `đ` has no combining mark so it is mapped by hand. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}
