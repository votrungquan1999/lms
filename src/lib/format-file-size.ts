const UNITS = ["B", "KB", "MB", "GB"];

/**
 * Rounds a size to what is shown: one decimal below 10 of a unit, whole
 * numbers otherwise (bytes are already whole).
 * @param value - The size in the given unit.
 * @param unit - Index into UNITS.
 * @returns The rounded size; printing it drops a trailing ".0".
 */
function roundSize(value: number, unit: number): number {
  return unit > 0 && value < 10
    ? Math.round(value * 10) / 10
    : Math.round(value);
}

/**
 * Formats a byte count for people ("229 B", "1.2 KB", "10 KB", "15 MB").
 * @param bytes - The file size in bytes.
 */
export function formatFileSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  // Step up on the rounded value so 1023.99 KB reads "1 MB", not "1024 KB".
  while (roundSize(value, unit) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${roundSize(value, unit)} ${UNITS[unit]}`;
}
