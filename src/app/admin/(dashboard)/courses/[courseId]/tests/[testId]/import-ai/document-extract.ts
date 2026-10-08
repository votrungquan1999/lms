/**
 * Client-side text extraction for AI question import (`.docx` / `.pdf`).
 * Only the extracted text ever reaches the AI; the document's pictures are
 * uploaded to storage only when the teacher imports. `mammoth` is
 * lazy-imported so it stays out of the server bundle and the initial client
 * bundle.
 */

import type mammoth from "mammoth";
import { MediaContentType } from "src/lib/question-service";
import { EXTENSION_BY_CONTENT_TYPE } from "../question-media.schema";

type DocxInput = Parameters<typeof mammoth.convertToHtml>[0];

/** Picture formats a question can show; anything else (e.g. an EMF equation) is left out. */
const PICTURE_TYPES: string[] = [
  MediaContentType.PNG,
  MediaContentType.JPEG,
  MediaContentType.WEBP,
];

/** The slice of mammoth's parsed document tree this module reads. */
interface DocxElement {
  type: string;
  value?: string;
  children?: DocxElement[];
  highlight?: string | null;
}

/** A picture in mammoth's document tree; its bytes are read on demand. */
interface DocxImage extends DocxElement {
  type: "image";
  contentType?: string;
  readAsArrayBuffer: () => Promise<ArrayBuffer>;
}

/** A stretch of paragraph text that shares one formatting. */
interface TextSegment {
  text: string;
  highlight: string | null;
}

/** A picture from the document, numbered as its `[image N]` tag in the text. */
export interface DocumentPicture {
  number: number;
  file: File;
}

/** What import reads out of a document: its text, plus the pictures it tags. */
export interface ExtractedDocument {
  text: string;
  pictures: DocumentPicture[];
}

/**
 * Extracts a `.docx`'s text and pictures entirely in the browser.
 * @param file - The selected `.docx` file.
 * @returns The document's marked-up text and its pictures.
 */
export async function extractDocx(file: File): Promise<ExtractedDocument> {
  return readDocx({ arrayBuffer: await file.arrayBuffer() });
}

/**
 * Reads a `.docx`'s text, keeping highlights as `<mark color="…">` tags —
 * teachers mark answer keys that way, and plain text would lose them. Split
 * from `extractDocx` because mammoth's browser build reads `{ arrayBuffer }`
 * but its Node build (unit tests) only reads `{ buffer }`.
 * @param input - The document bytes in the shape mammoth's active build reads.
 * @returns The document's text with formatting markers, and its pictures.
 */
export async function readDocx(input: DocxInput): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const captured: DocxElement[] = [];
  // extractRawText takes no options, so borrow convertToHtml's parse step for
  // the tree, then hand it an empty body so it skips all HTML/image work.
  await mammoth.convertToHtml(input, {
    transformDocument: (document: DocxElement) => {
      captured.push(document);
      return { ...document, children: [] };
    },
  });
  const document = captured[0];
  if (!document) return { text: "", pictures: [] };

  const pictureNumbers = new Map<DocxElement, number>();
  const pictures: DocumentPicture[] = [];
  const pictureBytes: Uint8Array[] = [];
  for (const image of findImages(document)) {
    const type = image.contentType ?? "";
    if (!PICTURE_TYPES.includes(type)) continue;
    const bytes = new Uint8Array(await image.readAsArrayBuffer());
    // Word can store one picture twice; the same bytes keep one number.
    const repeatIndex = pictureBytes.findIndex((seen) =>
      sameBytes(seen, bytes),
    );
    if (repeatIndex !== -1) {
      pictureNumbers.set(image, repeatIndex + 1);
      continue;
    }

    const number = pictures.length + 1;
    const extension = EXTENSION_BY_CONTENT_TYPE[type as MediaContentType];
    pictureBytes.push(bytes);
    pictures.push({
      number,
      file: new File([bytes], `picture-${number}.${extension}`, { type }),
    });
    pictureNumbers.set(image, number);
  }

  const text = elementToMarkedText(document, pictureNumbers).trim();
  return { text, pictures };
}

/**
 * Compares two pictures' bytes.
 * @param a - One picture's bytes.
 * @param b - The other picture's bytes.
 * @returns True when they are the same picture.
 */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/**
 * Lists every picture in the document, in reading order.
 * @param element - The node to search under.
 * @returns The pictures found.
 */
function findImages(element: DocxElement): DocxImage[] {
  if (element.type === "image") return [element as DocxImage];
  return (element.children ?? []).flatMap(findImages);
}

/**
 * Renders any element as text, mirroring mammoth's own raw-text rules
 * (paragraphs end in a blank line) but marking up formatted runs.
 * @param element - A node of mammoth's document tree.
 * @param pictureNumbers - The `[image N]` number of each picture to tag.
 * @returns The element's text with formatting markers.
 */
function elementToMarkedText(
  element: DocxElement,
  pictureNumbers: Map<DocxElement, number>,
): string {
  if (element.type === "paragraph") {
    return `${paragraphToMarkedText(element, pictureNumbers)}\n\n`;
  }
  return (element.children ?? [])
    .map((child) => elementToMarkedText(child, pictureNumbers))
    .join("");
}

/**
 * Renders one paragraph, merging adjacent runs that share formatting — Word
 * splits text into runs arbitrarily, so one answer can span several.
 * @param paragraph - A paragraph node.
 * @param pictureNumbers - The `[image N]` number of each picture to tag.
 * @returns The paragraph's text with formatting markers.
 */
function paragraphToMarkedText(
  paragraph: DocxElement,
  pictureNumbers: Map<DocxElement, number>,
): string {
  const segments: TextSegment[] = [];
  collectSegments(paragraph, null, segments, pictureNumbers);

  const merged: TextSegment[] = [];
  for (const segment of segments) {
    const last = merged.at(-1);
    if (last && last.highlight === segment.highlight) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged
    .map(({ text, highlight }) =>
      highlight ? `<mark color="${highlight}">${text}</mark>` : text,
    )
    .join("");
}

/**
 * Flattens a paragraph's runs (including those nested in hyperlinks) into
 * text segments tagged with the formatting of the run they came from.
 * @param element - The node to walk.
 * @param highlight - The enclosing run's highlight colour, if any.
 * @param segments - Accumulator, appended to in document order.
 * @param pictureNumbers - The `[image N]` number of each picture to tag.
 */
function collectSegments(
  element: DocxElement,
  highlight: string | null,
  segments: TextSegment[],
  pictureNumbers: Map<DocxElement, number>,
): void {
  if (element.type === "text") {
    segments.push({ text: element.value ?? "", highlight });
    return;
  }
  if (element.type === "tab") {
    segments.push({ text: "\t", highlight });
    return;
  }
  // mammoth's raw text drops line breaks, gluing options typed one per line.
  // Unhighlighted, so a break never lands inside an answer's mark.
  if (element.type === "break") {
    segments.push({ text: "\n", highlight: null });
    return;
  }
  // The tag tells the AI where the picture sat, so it can say which question owns it.
  if (element.type === "image") {
    const number = pictureNumbers.get(element);
    if (number) segments.push({ text: `[image ${number}]`, highlight: null });
    return;
  }
  const childHighlight =
    element.type === "run" ? (element.highlight ?? null) : highlight;
  for (const child of element.children ?? []) {
    collectSegments(child, childHighlight, segments, pictureNumbers);
  }
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
