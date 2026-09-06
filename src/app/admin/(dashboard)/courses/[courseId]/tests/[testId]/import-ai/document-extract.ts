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

/**
 * Extracts plain text from a `.pdf` file entirely in the browser, joining
 * every page's text in order. Uses the `legacy` pdf.js build so the exact
 * same code path runs under Node (this file's own unit test) and in every
 * supported browser. Under Node, pdf.js force-disables the real `Worker` and
 * falls back to an in-process fake worker — but that fake-worker path still
 * tries to resolve and load whatever `workerSrc` points at, and errors
 * loudly if it can't be found. `workerSrc` is therefore set only in the real
 * browser (guarded below); Node resolves its own bundled worker unprompted.
 * @param file - The selected `.pdf` file.
 * @returns The joined text of every page, trimmed.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Only the real browser needs an explicit worker URL — Turbopack cannot
  // resolve a bare relative worker path on its own. Under Node (this file's
  // own unit test) pdf.js resolves its bundled worker itself; pointing
  // `workerSrc` at a path relative to THIS file would be wrong there.
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDocument = await pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
  }).promise;

  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pageTexts.push(
      textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }

  return pageTexts.join("\n").trim();
}
