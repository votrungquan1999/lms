import fs from "node:fs";
import path from "node:path";
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import {
  type DocumentPicture,
  extractTextFromPdf,
  readDocx,
} from "../document-extract";

// Teachers mark answer keys by highlighting them; Word often splits one highlight into several runs.
const FORMATTED_ANSWERS_DOCX = path.join(
  process.cwd(),
  "e2e/fixtures/formatted-answers.docx",
);
// Pictures on their own line and inline, one placed twice, and an EMF the LMS can't show.
const PICTURES_DOCX = path.join(process.cwd(), "e2e/fixtures/pictures.docx");
const ANSWER_PNG = path.join(process.cwd(), "e2e/fixtures/test-answer.png");

describe("readDocx", () => {
  it("wraps highlighted text in one mark tag naming its colour, even when Word split it across runs", async () => {
    const { text } = await readDocx({
      buffer: fs.readFileSync(FORMATTED_ANSWERS_DOCX),
    });

    expect(text).toContain('A. <mark color="yellow">vi khuẩn.</mark>');
    expect(text).toContain('C. <mark color="cyan">nấm men.</mark>');
  });

  it("keeps a line break inside a paragraph as a newline, so options on their own lines don't run together", async () => {
    const { text } = await readDocx({
      buffer: fs.readFileSync(FORMATTED_ANSWERS_DOCX),
    });

    expect(text).toContain(
      'Câu 2: Virus là\nA. sinh vật nhân sơ.\n<mark color="yellow">B. dạng sống không có cấu tạo tế bào.</mark>',
    );
  });

  it("tags each picture as [image N] where it sits, and returns the picture under that number", async () => {
    const { text, pictures } = await readDocx({
      buffer: fs.readFileSync(PICTURES_DOCX),
    });

    expect(text).toContain("Câu 1: Quan sát hình bên.\n\n[image 1]");
    expect(text).toContain("Câu 2: Hình bên là cấu trúc nào? [image 2]");
    const first = pictures.find((picture) => picture.number === 1);
    expect(first?.file.type).toBe("image/png");
    expect(
      new Uint8Array(await (first as DocumentPicture).file.arrayBuffer()),
    ).toEqual(new Uint8Array(fs.readFileSync(ANSWER_PNG)));
  });

  it("gives a picture placed twice one number, so a question never attaches the same picture twice", async () => {
    const { text, pictures } = await readDocx({
      buffer: fs.readFileSync(PICTURES_DOCX),
    });

    expect(text).toContain("[image 2]\n\n[image 1]\n\nCâu 3");
    const answerBytes = fs.readFileSync(ANSWER_PNG);
    const pictureBytes = await Promise.all(
      pictures.map(async (picture) =>
        Buffer.from(await picture.file.arrayBuffer()),
      ),
    );
    expect(
      pictureBytes.filter((bytes) => bytes.equals(answerBytes)),
    ).toHaveLength(1);
  });

  it("leaves out a picture the LMS can't show (an EMF), so the AI never assigns it", async () => {
    const { text, pictures } = await readDocx({
      buffer: fs.readFileSync(PICTURES_DOCX),
    });

    expect(text.endsWith("Câu 3: Phương trình")).toBe(true);
    expect(pictures.map((picture) => picture.file.type)).toEqual([
      "image/png",
      "image/png",
    ]);
  });
});

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
