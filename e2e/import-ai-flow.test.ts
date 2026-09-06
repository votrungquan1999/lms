/**
 * Feature: AI document import (E2E)
 *
 * An admin uploads a PDF of exam questions to a test's "Import Questions
 * with AI" page. Text extraction runs in the REAL browser via pdf.js's
 * Worker; the extracted text is sent to Gemini, which returns structured
 * questions for the admin to review.
 *
 * This is the ONLY test layer that proves the real browser Worker ran and
 * that Turbopack correctly bundled/served pdf.js's worker asset — the
 * Node-environment unit test (`document-extract.test.tsx`) runs with
 * pdf.js's worker force-disabled by pdf.js itself, so it cannot exercise
 * this path at all.
 *
 * The Gemini call happens SERVER-SIDE inside the Server Action, so
 * Playwright's browser-level `page.route` can't intercept it the way
 * `course-materials-flow.test.ts` intercepts its browser→S3 PUT. Instead,
 * `dev:e2e` starts an in-process MSW server (from `instrumentation.ts`,
 * gated on `E2E_MOCK_AI`) that intercepts Gemini's `generateContent` call
 * — see `src/mocks/e2e-gemini-mock.ts` (D60). No live API key is needed.
 *
 * The review-list assertions below check for that mock's canned content
 * (`MOCK_QUESTION_TITLE`, `PDF_TEXT_RECEIVED_MARKER`), not the PDF's own
 * text — text a real (or accidentally successful) Gemini call could never
 * produce, so a pass proves the mock actually intercepted the call, and the
 * "yes" marker proves the real extracted PDF text reached it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { createElement } from "react";

const COURSE_TITLE = "Import AI E2E Course";
const TEST_TITLE = "Import AI E2E Test";
const QUESTION_TEXT = "Explain photosynthesis in one sentence.";

// Mirrors `src/mocks/e2e-gemini-mock.ts`'s exported sentinels — duplicated
// here (not imported) to keep this spec self-contained, matching every
// other e2e spec's style in this file's directory.
const MOCK_QUESTION_TITLE = "MSW mock: Gemini call intercepted";
const PDF_TEXT_RECEIVED_MARKER = "Extracted PDF text reached the mock: yes";

let pdfPath: string;

test.describe("AI Document Import Flow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    // A real, text-bearing PDF built the same way as the Node unit test's
    // fixture — proves this spec exercises real extraction, not a stub.
    const buffer = await renderToBuffer(
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(Text, null, `1. ${QUESTION_TEXT}`),
        ),
      ),
    );
    pdfPath = path.join(os.tmpdir(), `import-ai-e2e-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, buffer);
  });

  test.afterAll(() => {
    if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  });

  test("setup: admin creates a course and a test", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For import-ai e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(
      page.getByRole("heading", { name: COURSE_TITLE }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("admin uploads a PDF and sees the extracted question for review", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await expect(
      page.getByRole("heading", { name: "Import Questions with AI" }),
    ).toBeVisible();

    // Real <input type="file"> upload — this is what triggers the real
    // browser Worker running pdf.js against real Turbopack-bundled assets.
    await page.getByLabel(/document/i).setInputFiles(pdfPath);

    // The review list renders the mock's canned question — text no real (or
    // accidentally successful) Gemini call could produce, proving MSW
    // actually intercepted the call rather than silently falling through.
    await expect(page.getByText(MOCK_QUESTION_TITLE)).toBeVisible({
      timeout: 20000,
    });
    // And this marker's "yes" proves the real extracted PDF text — not just
    // some text — reached the mock, i.e. the real browser Worker + Turbopack
    // bundling genuinely ran.
    await expect(page.getByText(PDF_TEXT_RECEIVED_MARKER)).toBeVisible();
    await expect(page.getByText(/free response/i)).toBeVisible();
  });
});
