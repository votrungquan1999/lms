/**
 * Visual-QA tour: the admin test-detail screen (question authoring) and the
 * AI import screen it links to.
 *
 * Everything this tour creates is namespaced "[tests] …". The scratch test is
 * deleted and recreated at the start of every run, so the empty-state capture
 * is the same on the first run and the hundredth.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  Document,
  Page as PdfPage,
  renderToBuffer,
  Text,
} from "@react-pdf/renderer";
import { createElement } from "react";
import { prepareVisualPage, snap } from "./snap";

const DETAIL_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/page.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/test-settings-panel.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/add-question-form.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-questions-form.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/compose-from-pools-form.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/question-list.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/question-edit.state.tsx",
];

const ADD_FORM_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/add-question-form.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/question-media-picker.ui.tsx",
  "src/components/optional-text-field.tsx",
];

const IMPORT_AI_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-ai/page.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-ai/question-preview.ui.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-ai/import-ai-form.state.tsx",
];

const COURSE_URL = "/admin/courses/seed-course-fundamentals";
const SEED_TEST_URL = `${COURSE_URL}/tests/seed-test-visible`;

/** Long name with spaces — the stress input, carried by the scratch test's own h1. */
const LONG_NAME =
  "Nhập môn Cấu trúc dữ liệu và Giải thuật nâng cao cho sinh viên năm hai";
/** Pasted email-like value: one unbroken token, the classic layout breaker. */
const UNBROKEN =
  "nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn";

const SCRATCH_TITLE = `[tests] ${LONG_NAME}`;
const SCRATCH_DESCRIPTION =
  "Scratch test owned by the tests visual tour — safe to delete.";

/** Set by the first test; every later test re-finds the scratch test by title. */
let pdfPath = "";

test.describe.configure({ mode: "serial" });

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

test.beforeAll(async () => {
  // A real, text-bearing PDF — the import-ai path extracts text in the browser
  // before it ever reaches the (mocked) provider, so a stub file would stop short.
  const buffer = await renderToBuffer(
    createElement(
      Document,
      null,
      createElement(
        PdfPage,
        { size: "A4" },
        createElement(Text, null, "1. Explain photosynthesis in one sentence."),
      ),
    ),
  );
  // Fixed name: the picker shows the filename, so a timestamped one would
  // change the capture on every run.
  pdfPath = path.join(os.tmpdir(), "tests-tour-import.pdf");
  fs.writeFileSync(pdfPath, buffer);
});

test.afterAll(() => {
  if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
});

/** How many scratch tests the course currently lists (0 or 1 in practice). */
function scratchLink(page: Page) {
  return page.getByRole("link", { name: SCRATCH_TITLE });
}

/** Opens the scratch test's detail page. */
async function gotoScratchTest(page: Page): Promise<void> {
  await page.goto(COURSE_URL);
  await scratchLink(page).first().click();
  await expect(
    page.getByRole("heading", { name: SCRATCH_TITLE, level: 1 }),
  ).toBeVisible();
}

/** Opens the Add Question panel on the given question type. */
async function selectQuestionType(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("tests: a brand-new test with no questions", async ({ page }) => {
  // Delete + recreate + two list round-trips, against a dev server other
  // tours are also compiling against.
  test.slow();
  await page.goto(COURSE_URL);

  // Delete last run's scratch test so the empty state is genuinely empty.
  while ((await scratchLink(page).count()) > 0) {
    await scratchLink(page).first().click();
    await expect(
      page.getByRole("heading", { name: SCRATCH_TITLE, level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete Test" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(async () => {
      await page.goto(COURSE_URL);
      expect(await scratchLink(page).count()).toBe(0);
    }).toPass({ timeout: 20000 });
  }

  await page.getByRole("button", { name: "Add Test" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Test Title").fill(SCRATCH_TITLE);
  await dialog.getByLabel("Description").fill(SCRATCH_DESCRIPTION);
  await dialog.getByRole("button", { name: "Create Test" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 20000,
  });

  await expect(async () => {
    await page.goto(COURSE_URL);
    expect(await scratchLink(page).count()).toBe(1);
  }).toPass({ timeout: 20000 });

  await gotoScratchTest(page);
  await expect(
    page.getByText("No questions yet. Add one above or import from JSON."),
  ).toBeVisible();
  await snap(page, "tests/detail-empty", { sources: DETAIL_SOURCES });
});

test("tests: add-question filled for free text", async ({ page }) => {
  await gotoScratchTest(page);

  await selectQuestionType(page, "Free Text");
  await page
    .locator("#question-title")
    .fill("Q1: Giải thích độ phức tạp thời gian của thuật toán sắp xếp nhanh");
  await page
    .locator("#question-content")
    .fill(
      "## Yêu cầu\n\nGiải thích **quicksort** và cho biết:\n\n1. Trường hợp tốt nhất\n2. Trường hợp xấu nhất\n3. Trung bình\n\n```ts\nfunction quicksort(xs: number[]): number[] {}\n```",
    );
  await page
    .locator("#question-reference-answer")
    .fill(
      "Trung bình O(n log n); xấu nhất O(n^2) khi pivot luôn là phần tử nhỏ nhất.",
    );
  await page
    .locator("#question-explanation")
    .fill(
      "Một câu trả lời tốt nêu cả ba trường hợp và giải thích vai trò của pivot.",
    );
  await page.getByLabel("Compare side by side").click();

  await expect(page.locator("#question-reference-answer")).not.toBeEmpty();
  await snap(page, "tests/add-free-text-filled", { sources: ADD_FORM_SOURCES });
});

test("tests: add-question filled for single select", async ({ page }) => {
  await gotoScratchTest(page);

  await selectQuestionType(page, "Single Select");
  await page
    .locator("#question-title")
    .fill("Q2: Which mailbox owns the course?");
  await page
    .locator("#question-content")
    .fill("Pick the address the enrolment confirmation is sent from.");

  await page.locator("#option-text-0").fill("A short one");
  await page.locator("#option-text-1").fill(UNBROKEN);
  await page.getByRole("button", { name: "+ Add Option" }).click();
  await page
    .locator("#option-text-2")
    .fill(
      "Một phương án rất dài có nhiều dấu cách để xem chữ có xuống dòng đúng hay không",
    );
  await page.getByLabel("Mark option 2 correct").click();
  await page
    .locator("#question-explanation")
    .fill("Only the student-domain address is monitored.");

  await expect(page.locator("#option-text-2")).not.toBeEmpty();
  await snap(page, "tests/add-single-select-filled", {
    sources: ADD_FORM_SOURCES,
  });
});

test("tests: add-question filled for multi select", async ({ page }) => {
  await gotoScratchTest(page);

  await selectQuestionType(page, "Multi Select");
  await page
    .locator("#question-title")
    .fill(
      "Q3: Chọn tất cả các cấu trúc dữ liệu có thời gian tra cứu trung bình O(1)",
    );
  await page
    .locator("#question-content")
    .fill("Chọn **tất cả** các đáp án đúng. Câu hỏi này được chấm tự động.");

  await page.locator("#option-text-0").fill("Hash table");
  await page.locator("#option-text-1").fill("Balanced binary search tree");
  await page.getByRole("button", { name: "+ Add Option" }).click();
  await page.locator("#option-text-2").fill("Array indexed by key");
  await page.getByLabel("Mark option 1 correct").click();
  await page.getByLabel("Mark option 3 correct").click();
  await page
    .locator("#question-explanation")
    .fill("A balanced BST is O(log n), not O(1).");

  await expect(page.locator("#option-text-2")).not.toBeEmpty();
  await snap(page, "tests/add-multi-select-filled", {
    sources: ADD_FORM_SOURCES,
  });
});

test("tests: add-question with many options", async ({ page }) => {
  await gotoScratchTest(page);

  await selectQuestionType(page, "Multi Select");
  await page
    .locator("#question-title")
    .fill("Q4: Select every valid contact address");

  const optionTexts = [
    "alice@x.io",
    UNBROKEN,
    "Một phương án dài với nhiều dấu cách để kiểm tra việc xuống dòng trong hàng lựa chọn",
    "bob@x.io",
    "carol@x.io",
    "dan@x.io",
    "eve@x.io",
  ];
  for (let i = 2; i < optionTexts.length; i++) {
    await page.getByRole("button", { name: "+ Add Option" }).click();
  }
  for (const [i, text] of optionTexts.entries()) {
    await page.locator(`#option-text-${i}`).fill(text);
  }
  await page.getByLabel("Mark option 1 correct").click();
  await page.getByLabel("Mark option 4 correct").click();
  await page.getByLabel("Mark option 7 correct").click();

  await expect(page.locator("#option-text-6")).not.toBeEmpty();
  await snap(page, "tests/add-many-options", { sources: ADD_FORM_SOURCES });
});

test("tests: add-question rejected with a blank title", async ({ page }) => {
  await gotoScratchTest(page);

  // Whitespace satisfies the input's own `required`, so the server-side
  // "required field is empty" rejection is what actually renders.
  await page.locator("#question-title").fill("   ");
  await page
    .locator("#question-content")
    .fill("Body written, title forgotten.");
  await page.getByRole("button", { name: "Add Question" }).click();

  await expect(page.getByText("Question title is required")).toBeVisible();
  await snap(page, "tests/add-validation-error", { sources: ADD_FORM_SOURCES });
});

test("tests: add-question success banner", async ({ page }) => {
  await gotoScratchTest(page);

  await page.locator("#question-title").fill("Q1: Mảng và danh sách liên kết");
  await page
    .locator("#question-content")
    .fill(
      "So sánh mảng động và danh sách liên kết đôi về chi phí chèn và xoá.",
    );
  await page.getByRole("button", { name: "Add Question" }).click();

  await expect(page.getByText("added successfully")).toBeVisible({
    timeout: 20000,
  });
  await snap(page, "tests/add-success-banner", { sources: ADD_FORM_SOURCES });
});

test("tests: a question pasted as one unbroken string", async ({ page }) => {
  await gotoScratchTest(page);

  await page.locator("#question-title").fill(UNBROKEN);
  await page.locator("#question-content").fill(`${UNBROKEN} ${UNBROKEN}`);
  await page.getByRole("button", { name: "Add Question" }).click();

  await expect(page.getByText("added successfully")).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole("heading", { name: "Questions (2)" }),
  ).toBeVisible();
  await snap(page, "tests/unbroken-question", { sources: DETAIL_SOURCES });
});

test("tests: settings saved with practice on", async ({ page }) => {
  await gotoScratchTest(page);

  await page.getByLabel("Practice test (no grades, reveal-on-answer)").click();
  await expect(page.locator("#time-limit-minutes")).toBeDisabled();
  await page.getByRole("button", { name: "Save Settings" }).click();

  await expect(page.getByText("Settings saved")).toBeVisible({
    timeout: 20000,
  });
  await snap(page, "tests/settings-practice-saved", {
    sources: [
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/test-settings-panel.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/page.tsx",
    ],
  });
});

test("tests: seeded test with three question types", async ({ page }) => {
  await page.goto(SEED_TEST_URL);
  await expect(
    page.getByRole("heading", { name: "Questions (3)" }),
  ).toBeVisible();
  await snap(page, "tests/detail-seeded", { sources: DETAIL_SOURCES });
});

test("tests: import-ai initial state", async ({ page }) => {
  await page.goto(`${SEED_TEST_URL}/import-ai`);
  await expect(
    page.getByRole("heading", { name: "Import Questions with AI" }),
  ).toBeVisible();
  await snap(page, "tests/import-ai-initial", { sources: IMPORT_AI_SOURCES });
});

test("tests: import-ai review list", async ({ page }) => {
  // Real in-browser pdf.js extraction before the (mocked) provider answers.
  test.slow();
  await gotoScratchTest(page);
  await page.getByRole("link", { name: "Import Questions with AI" }).click();
  await expect(
    page.getByRole("heading", { name: "Import Questions with AI" }),
  ).toBeVisible();

  await page.getByLabel(/document/i).setInputFiles(pdfPath);
  await expect(
    page.getByRole("heading", { name: /question.* found/i }),
  ).toBeVisible({
    timeout: 30000,
  });
  await snap(page, "tests/import-ai-review", { sources: IMPORT_AI_SOURCES });
});
