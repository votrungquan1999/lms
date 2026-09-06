import fs from "node:fs";
import path from "node:path";
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { extractTextFromPdf } from "../document-extract";

/** Builds a real, in-memory multi-page PDF with known text on each page. */
async function makePdfFile(pageTexts: string[]): Promise<File> {
  const pages = pageTexts.map((text, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static fixture, order never changes
    <Page key={index} size="A4">
      <Text>{text}</Text>
    </Page>
  ));
  const buffer = await renderToBuffer(<Document>{pages}</Document>);
  // Copy into a plain Uint8Array — Buffer's ArrayBufferLike backing isn't
  // assignable to File's BlobPart (ArrayBuffer only).
  return new File([new Uint8Array(buffer)], "questions.pdf", {
    type: "application/pdf",
  });
}

describe("extractTextFromPdf", () => {
  it("extracts real text from a PDF and joins every page's text", async () => {
    const file = await makePdfFile([
      "Page one: explain photosynthesis.",
      "Page two: pick the prime number.",
    ]);

    const text = await extractTextFromPdf(file);

    expect(text).toContain("Page one: explain photosynthesis.");
    expect(text).toContain("Page two: pick the prime number.");
  });

  it("resolves to an empty string for a PDF with no extractable text (real, genuinely textless fixture)", async () => {
    const bytes = fs.readFileSync(
      path.join(process.cwd(), "e2e/fixtures/test-material.pdf"),
    );
    const file = new File([new Uint8Array(bytes)], "test-material.pdf", {
      type: "application/pdf",
    });

    const text = await extractTextFromPdf(file);

    expect(text).toBe("");
  });
});
