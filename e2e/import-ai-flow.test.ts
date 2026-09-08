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

  test("admin clicks Import and the question is actually written onto the test", async ({
    page,
  }) => {
    // Each `test()` gets a fresh page, so the review list from the previous
    // test isn't still on screen — repeat the navigation + upload to get
    // back to it before clicking Import.
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await expect(
      page.getByRole("heading", { name: "Import Questions with AI" }),
    ).toBeVisible();
    await page.getByLabel(/document/i).setInputFiles(pdfPath);
    await expect(page.getByText(MOCK_QUESTION_TITLE)).toBeVisible({
      timeout: 20000,
    });

    // Default mode is APPEND, so the primary button reads "Import questions"
    // and writes immediately — no confirmation dialog for this mode.
    await page.getByRole("button", { name: "Import questions" }).click();

    // A real write, not an echo of the review list: this is the test's OWN
    // admin question list (a different page than the review list we just
    // left), proving `importAiQuestionsAction` actually persisted the
    // question rather than just clearing the review screen.
    await expect(
      page.getByRole("heading", { name: TEST_TITLE, level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("heading", { name: "Questions (1)" }),
    ).toBeVisible();
    await expect(page.getByText(MOCK_QUESTION_TITLE)).toBeVisible();
    // `.first()`: the content also appears a second time in this question's
    // always-visible inline edit textarea below the read-only preview.
    await expect(
      page.getByText(PDF_TEXT_RECEIVED_MARKER).first(),
    ).toBeVisible();
  });
});

// ─── REPLACE mode ────────────────────────────────────────────────────────────
// The destructive path: an existing question must be gone and the imported
// one present afterward, and the typed "override" confirmation must be a
// real gate — the confirm button stays disabled until the exact word is typed.

test.describe("AI Document Import Flow — REPLACE mode", () => {
  test.describe.configure({ mode: "serial" });

  const REPLACE_COURSE_TITLE = "Replace E2E Course";
  const REPLACE_TEST_TITLE = "Replace E2E Test";
  const OLD_QUESTION_TITLE = "Replace E2E Old Question";

  let replacePdfPath: string;

  test.beforeAll(async () => {
    // Same shape as the top-of-file fixture (real, text-bearing PDF), built
    // separately so this describe block owns its own file lifecycle.
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
    replacePdfPath = path.join(
      os.tmpdir(),
      `import-ai-e2e-replace-${Date.now()}.pdf`,
    );
    fs.writeFileSync(replacePdfPath, buffer);
  });

  test.afterAll(() => {
    if (replacePdfPath && fs.existsSync(replacePdfPath)) {
      fs.unlinkSync(replacePdfPath);
    }
  });

  test("setup: admin creates a course, a test, and one existing question", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(REPLACE_COURSE_TITLE);
    await page.getByLabel("Description").fill("For import-ai REPLACE e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(REPLACE_COURSE_TITLE).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(REPLACE_TEST_TITLE);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // The pre-existing question REPLACE must remove.
    await page.goto("/admin/courses");
    await page.getByText(REPLACE_COURSE_TITLE).click();
    await page.getByText(REPLACE_TEST_TITLE).click();
    await page.getByLabel("Question Title").fill(OLD_QUESTION_TITLE);
    await page
      .getByLabel("Content (Markdown)")
      .fill("This question should be removed by REPLACE.");
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });
    // Scoped to the question card's own title (not the success toast, which
    // also contains this text) to avoid a strict-mode ambiguity.
    await expect(
      page
        .locator('[data-slot="card-title"]')
        .filter({ hasText: OLD_QUESTION_TITLE }),
    ).toBeVisible();
  });

  test("REPLACE requires typing the exact confirmation word, then removes the old question and writes the new one", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(REPLACE_COURSE_TITLE).click();
    await page.getByText(REPLACE_TEST_TITLE).click();
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await expect(
      page.getByRole("heading", { name: "Import Questions with AI" }),
    ).toBeVisible();

    await page.getByLabel(/document/i).setInputFiles(replacePdfPath);
    await expect(page.getByText(MOCK_QUESTION_TITLE)).toBeVisible({
      timeout: 20000,
    });

    await page
      .getByRole("radio", { name: "Replace the test's existing questions" })
      .click();
    await page.getByRole("button", { name: "Replace questions" }).click();
    await expect(
      page.getByRole("heading", { name: /Replace this test.s questions\?/ }),
    ).toBeVisible();

    const confirmInput = page.locator("#replace-confirm-text");
    const confirmButton = page.getByRole("button", { name: "Yes, replace" });

    // Nothing typed yet — the button must not be clickable.
    await expect(confirmButton).toBeDisabled();

    // The wrong word — still disabled, proving the check is on the exact
    // word rather than "the field is non-empty".
    await confirmInput.fill("yes please");
    await expect(confirmButton).toBeDisabled();

    // The exact word — now, and only now, enabled.
    await confirmInput.fill("override");
    await expect(confirmButton).toBeEnabled();

    await confirmButton.click();

    // Then: back on the test page, the old question is GONE and the
    // imported one is present — a real destructive replace, not merely a
    // closed dialog.
    await expect(
      page.getByRole("heading", { name: REPLACE_TEST_TITLE, level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("heading", { name: "Questions (1)" }),
    ).toBeVisible();
    await expect(page.getByText(MOCK_QUESTION_TITLE)).toBeVisible();
    await expect(page.getByText(OLD_QUESTION_TITLE)).not.toBeVisible();
  });
});
