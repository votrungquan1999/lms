/**
 * Client-side text extraction for AI question import (`.docx` / `.pdf`).
 * Only the extracted plain text ever crosses the wire — the file itself
 * never leaves the browser. `mammoth` is lazy-imported so it stays out of
 * the server bundle and the initial client bundle.
 */

/**
 * Extracts plain text from a `.docx` file entirely in the browser.
 * @param file - The selected `.docx` file.
 * @returns The document's raw text (mammoth strips formatting).
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}
