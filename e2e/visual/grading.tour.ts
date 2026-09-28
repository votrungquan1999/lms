/**
 * Visual-QA tour: grading.
 *
 * Routes covered:
 *   /admin/grading                                        (hub)
 *   /admin/grading/[testId]                               (variant two-pane shell)
 *   /admin/courses/[courseId]/tests/[testId]/grading      (course-scoped shell)
 *
 * Seeded rows are read-only here. The one mutation is a throwaway test inside
 * a "[grading]"-namespaced sandbox course, recreated on every run so the
 * release-control capture is reproducible.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { prepareVisualPage, snap } from "./snap";

const HUB = ["src/app/admin/(dashboard)/grading/page.tsx"];

const SHELL = [
  "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.ui.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-roster.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-roster.ui.tsx",
  "src/app/admin/(dashboard)/grading/student-status-badge.tsx",
];

const STUDENT_DETAIL = [
  ...SHELL,
  "src/app/admin/(dashboard)/grading/page-body/grading-detail-student.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/release-grade-for-student.tsx",
];

const TEST_ID = "seed-test-visible";
const HIDDEN_TEST_ID = "seed-test-hidden";
const COURSE_ID = "seed-course-fundamentals";
const VARIANT_PATH = `/admin/grading/${TEST_ID}`;

// Namespaced so other agents' captures stay clean. The test title is the
// unbroken-string stress value; the course title is the long-with-spaces one.
const SANDBOX_COURSE =
  "[grading] Nhập môn Cấu trúc dữ liệu và Giải thuật nâng cao cho sinh viên năm hai";
const SANDBOX_TEST =
  "[grading] nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn";

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  // The shell fans out per-student service calls for 16 enrolled students.
  test.setTimeout(120_000);
  await prepareVisualPage(page);
});

/** Opens the variant grading page and waits for the full seeded roster. */
async function openVariantRoster(page: Page): Promise<void> {
  await page.goto(VARIANT_PATH);
  await expect(
    page.getByRole("heading", { name: "Grade: Sandbox: All visibility ON" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page
      .getByTestId("grading-roster")
      .getByText("Hank Submitted (MC autograded, free-text pending)"),
  ).toBeVisible({ timeout: 60_000 });
}

/** Clicks a roster cell by student name and waits for that student's detail card. */
async function focusStudent(page: Page, name: string): Promise<void> {
  await page
    .getByTestId("grading-roster")
    .locator("a")
    .filter({ hasText: name })
    .first()
    .click();
  await expect(
    page
      .getByTestId("grading-main-pane")
      .locator(`[data-student-name="${name}"]`),
  ).toBeVisible({ timeout: 60_000 });
}

/** A link's href, guarded so a missing attribute fails loudly. */
async function hrefOf(locator: Locator): Promise<string> {
  const href = await locator.getAttribute("href");
  if (!href) throw new Error("Expected the link to carry an href");
  return href;
}

/** Creates the sandbox course on first run, then returns its id. */
async function ensureSandboxCourse(page: Page): Promise<string> {
  await page.goto("/admin/courses");
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

  const courseLink = page
    .locator('a[href^="/admin/courses/"]')
    .filter({ hasText: SANDBOX_COURSE });

  if ((await courseLink.count()) === 0) {
    await page.getByRole("button", { name: "Add Course" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Course Title").fill(SANDBOX_COURSE);
    await dialog
      .getByLabel("Description")
      .fill("[grading] Visual QA sandbox — deliberately has no students.");
    await dialog.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/admin/courses");
  }

  const href = await hrefOf(courseLink.first());
  return href.split("/").pop() as string;
}

/**
 * Deletes the sandbox test if a previous run left one behind, then creates it
 * fresh with grades withheld. A released test can never show the unreleased
 * control again, so the row has to start clean on every run.
 */
async function recreateSandboxTest(
  page: Page,
  courseId: string,
): Promise<string> {
  const testLink = () =>
    page
      .locator(`a[href^="/admin/courses/${courseId}/tests/"]`)
      .filter({ hasText: SANDBOX_TEST });

  await page.goto(`/admin/courses/${courseId}`);

  if ((await testLink().count()) > 0) {
    await page.goto(await hrefOf(testLink().first()));
    await page.getByRole("button", { name: "Delete Test" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(async () => {
      await page.goto(`/admin/courses/${courseId}`);
      await expect(testLink()).toHaveCount(0);
    }).toPass({ timeout: 30_000 });
  }

  await page.getByRole("button", { name: "Add Test" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Test Title").fill(SANDBOX_TEST);
  await dialog
    .getByRole("checkbox", { name: "Show grades immediately" })
    .uncheck();
  await dialog.getByRole("button", { name: "Create Test" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`/admin/courses/${courseId}`);
  await expect(testLink()).toHaveCount(1);
  const href = await hrefOf(testLink().first());
  return href.split("/").pop() as string;
}

// ── Hub ─────────────────────────────────────────────────────────────────────

test("grading: hub lists a test that needs grading", async ({ page }) => {
  await page.goto("/admin/grading");
  await expect(page.getByRole("heading", { name: "Grading" })).toBeVisible();
  await expect(page.getByTestId(`hub-test-card-${TEST_ID}`)).toBeVisible({
    timeout: 60_000,
  });
  await snap(page, "grading/hub-needs-grading", { sources: HUB });
});

test("grading: hub with the All filter (every test)", async ({ page }) => {
  await page.goto("/admin/grading?filter=all");
  await expect(page.getByTestId(`hub-test-card-${HIDDEN_TEST_ID}`)).toBeVisible(
    {
      timeout: 60_000,
    },
  );
  await snap(page, "grading/hub-all-tests", { sources: HUB });
});

test("grading: hub filter that matches nothing", async ({ page }) => {
  await page.goto("/admin/grading?filter=fully-graded");
  await expect(page.getByText("No tests match.")).toBeVisible({
    timeout: 60_000,
  });
  await snap(page, "grading/hub-no-match", { sources: HUB });
});

// ── Per-test roster (the many-items case) ───────────────────────────────────

test("grading: roster with every seeded student", async ({ page }) => {
  await openVariantRoster(page);
  await snap(page, "grading/roster-all-students", { sources: STUDENT_DETAIL });
});

test("grading: student who has not started", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Alice NotStarted");
  await snap(page, "grading/student-not-started", { sources: STUDENT_DETAIL });
});

test("grading: student still in progress", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Bob InProgress");
  await snap(page, "grading/student-in-progress", { sources: STUDENT_DETAIL });
});

test("grading: confirm dialog when grading an in-progress student", async ({
  page,
}) => {
  await openVariantRoster(page);
  await focusStudent(page, "Bob InProgress");
  // Opens the guard dialog only — "Submit Anyway" is never clicked, so no
  // grade is written to the shared seeded data.
  await page.getByRole("button", { name: "Save Grade" }).click();
  await expect(
    page.getByRole("alertdialog").getByText("Submit grade anyway?"),
  ).toBeVisible();
  await snap(page, "grading/grade-in-progress-confirm", {
    sources: [...STUDENT_DETAIL, "src/components/ui/alert-dialog.tsx"],
  });
});

test("grading: submitted student with a blank free-text answer", async ({
  page,
}) => {
  await openVariantRoster(page);
  await focusStudent(page, "Dan Submitted (blank free-text)");
  await expect(
    page.getByTestId("grading-main-pane").getByText("No answer submitted"),
  ).toBeVisible();
  await snap(page, "grading/student-blank-free-text", {
    sources: [
      ...STUDENT_DETAIL,
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/auto-grade-with-ai-button.tsx",
    ],
  });
});

test("grading: fully graded student", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Frank Graded (all answered)");
  await snap(page, "grading/student-graded", { sources: STUDENT_DETAIL });
});

test("grading: student with an active redo request", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Ivy Graded with active redo request");
  await expect(
    page.getByTestId("grading-main-pane").getByText("Redo requested"),
  ).toBeVisible();
  await snap(page, "grading/student-redo-requested", {
    sources: STUDENT_DETAIL,
  });
});

test("grading: student with an existing AI grade suggestion", async ({
  page,
}) => {
  await openVariantRoster(page);
  await focusStudent(
    page,
    "Noah Submitted with existing AI suggestion (test Regenerate)",
  );
  await expect(page.getByTestId("ai-suggestion-panel")).toBeVisible({
    timeout: 60_000,
  });
  await snap(page, "grading/student-ai-suggestion", {
    sources: [
      ...STUDENT_DETAIL,
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-suggestion-panel.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/auto-grade-with-ai-button.tsx",
    ],
  });
});

test("grading: by-question pivot with every student", async ({ page }) => {
  await page.goto(`${VARIANT_PATH}?mode=question`);
  await expect(
    page.getByRole("heading", { name: "Q1: Explain Big-O notation" }),
  ).toBeVisible({ timeout: 60_000 });
  await snap(page, "grading/by-question-all-students", {
    sources: [
      "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-roster-questions.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-detail-question.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-detail-question.ui.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
    ],
  });
});

// ── Course-scoped route ─────────────────────────────────────────────────────

test("grading: course-scoped page with the release controls", async ({
  page,
}) => {
  await page.goto(
    `/admin/courses/${COURSE_ID}/tests/${HIDDEN_TEST_ID}/grading`,
  );
  await expect(
    page.getByRole("heading", { name: "Grade: Sandbox: All visibility OFF" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Release Grades" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Release Correct Answers" }),
  ).toBeVisible();
  await snap(page, "grading/course-scoped-unreleased", {
    sources: [
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/page.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-detail-student.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-roster.ui.tsx",
    ],
  });
});

// ── Sandbox course: empty roster, unbroken title, release confirmation ──────

test("grading: empty roster and the grade-release control", async ({
  page,
}) => {
  const courseId = await ensureSandboxCourse(page);
  const testId = await recreateSandboxTest(page, courseId);

  await page.goto(`/admin/grading/${testId}`);
  await expect(
    page.getByText("No students enrolled in this course yet."),
  ).toBeVisible({ timeout: 60_000 });
  await snap(page, "grading/empty-roster-unbroken-title", {
    sources: [
      "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.ui.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
    ],
  });

  // Releasing revalidates the page, which drops the whole control — the
  // "Grades released ✓" confirmation never survives to be captured.
  await page.getByRole("button", { name: "Release Grades" }).click();
  await expect(
    page.getByRole("button", { name: "Release Grades" }),
  ).toHaveCount(0, { timeout: 30_000 });
  await snap(page, "grading/grades-released", {
    sources: [
      "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
    ],
  });
});
