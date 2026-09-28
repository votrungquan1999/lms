/**
 * Visual-QA tour: the student side — dashboard, course detail, and the whole
 * test-taking screen from first open through submission.
 *
 * Two rules shape the ordering:
 *   1. Submitting is one-way, so `seed-test-visible` is never written to. Every
 *      "before you submit" state is captured there with client-only input
 *      (typing, ticking a radio, opening the confirm dialog) — nothing reaches
 *      the database, so the state is identical on the first run and the tenth.
 *   2. The states that need real writes (saved answer, all-answered confirm,
 *      submitted) run against a scratch test this tour creates and deletes on
 *      every run, so they are reproducible too.
 *
 * `seed-test-hidden` is the one seeded row this tour mutates: submitting it is
 * idempotent — once submitted it stays submitted and re-renders identically.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { prepareVisualPage, snap } from "./snap";

const ADMIN_STATE = "playwright/.auth/admin.json";
const STUDENT_STATE = "playwright/.auth/student.json";

const COURSE_ID = "seed-course-fundamentals";
const VISIBLE_TEST_ID = "seed-test-visible";
const HIDDEN_TEST_ID = "seed-test-hidden";
const VISIBLE_TEST_TITLE = "Sandbox: All visibility ON";
const HIDDEN_TEST_TITLE = "Sandbox: All visibility OFF";
const ADMIN_COURSE_URL = `/admin/courses/${COURSE_ID}`;

const DRILL_TITLE = "[student] Timed drill";
const DRILL_DESCRIPTION =
  "Scratch timed test owned by the student visual tour — safe to delete.";
/**
 * Long enough that the deadline (server clock + this) still lands past the
 * frozen browser clock (2026-09-23T10:00:00Z), so the countdown renders a live
 * value instead of a flat 00:00. The number it shows is (deadline − frozen
 * clock), not a real remaining time — see states/student.md.
 */
const DRILL_MINUTES = 1500;

/** Long name with spaces — wraps, so it stresses line-height and box growth. */
const LONG_ANSWER =
  "Độ phức tạp O(n) có nghĩa là thời gian chạy của thuật toán tăng tuyến tính theo kích thước dữ liệu đầu vào. " +
  "Nếu dữ liệu tăng gấp đôi thì thời gian chạy cũng tăng xấp xỉ gấp đôi, bởi vì thuật toán phải duyệt qua từng phần tử đúng một lần. " +
  "Ví dụ điển hình là việc tìm giá trị lớn nhất trong một mảng chưa sắp xếp: ta phải so sánh lần lượt tất cả các phần tử. " +
  "Ngược lại, O(1) nghĩa là thời gian chạy không phụ thuộc vào kích thước dữ liệu, còn O(log n) thì mỗi bước loại bỏ được một nửa không gian tìm kiếm.";
/**
 * Pasted address: one unbroken token, the classic layout breaker. No hyphen and
 * no slash anywhere in it — those give the browser a break opportunity, which
 * is exactly what this input must not offer.
 */
const UNBROKEN =
  "nguyenthiphuongthao.khoahoccoban2026.decuongchitiethocphan.baitapchuong1va2va3.tailieuthamkhaonangcao@student.university.education.vietnam.edu.vn";
/** What the scratch test gets saved and submitted with: long prose + the unbroken token. */
const DRILL_ANSWER = `${LONG_ANSWER}\n\nTài liệu tham khảo: ${UNBROKEN}`;

const SHELL_SOURCES = [
  "src/app/student/(dashboard)/layout.tsx",
  "src/app/student/(dashboard)/student-sidebar.tsx",
  "src/app/student/(dashboard)/_ui/page-header.ui.tsx",
];
const DASHBOARD_SOURCES = [
  "src/app/student/(dashboard)/dashboard/page.tsx",
  "src/app/student/(dashboard)/dashboard/course-card.ui.tsx",
  "src/app/student/(dashboard)/_ui/stat-card.ui.tsx",
  ...SHELL_SOURCES,
];
const COURSE_SOURCES = [
  "src/app/student/(dashboard)/courses/[courseId]/page.tsx",
  "src/app/student/(dashboard)/courses/[courseId]/test-row.ui.tsx",
  "src/app/student/(dashboard)/_ui/status-badge.ui.tsx",
  ...SHELL_SOURCES,
];
const TEST_PAGE_SOURCES = [
  "src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/page.tsx",
  "src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/test-questions-section.tsx",
  "src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/answer-form.tsx",
  "src/components/markdown-content.tsx",
  ...SHELL_SOURCES,
];
const SUBMIT_SOURCES = [
  "src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/submit-test-button.tsx",
  ...TEST_PAGE_SOURCES,
];
const SUBMITTED_SOURCES = [
  "src/components/mc-answer-chips.tsx",
  ...TEST_PAGE_SOURCES,
];
const TIMED_SOURCES = [
  "src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/start-test-gate.tsx",
  "src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/countdown.state.tsx",
  ...TEST_PAGE_SOURCES,
];

/** Set when the scratch test is created; every later test re-uses it. */
let drillTestId = "";

test.use({ storageState: STUDENT_STATE });
// Shared rows and a one-way submit: a failure must stop the rest, not run them
// against half-built state.
test.describe.configure({ mode: "serial" });

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

/**
 * Waits until React has hydrated this element. Before that, clicking a form
 * button posts the form natively and throws away everything typed into it —
 * on a dev server that is a coin flip, not a rare race.
 */
async function hydrated(locator: Locator): Promise<Locator> {
  await expect
    .poll(
      () =>
        locator.evaluate((node) =>
          Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  return locator;
}

/** The scratch test's row on the admin course page. */
function drillLink(page: Page) {
  return page.getByRole("link", { name: DRILL_TITLE });
}

/** Soft-deletes every scratch test left by an earlier run. */
async function deleteDrillTests(page: Page): Promise<void> {
  await page.goto(ADMIN_COURSE_URL);
  while ((await drillLink(page).count()) > 0) {
    await drillLink(page).first().click();
    await expect(
      page.getByRole("heading", { name: DRILL_TITLE, level: 1 }),
    ).toBeVisible();
    await hydrated(page.getByRole("button", { name: "Delete Test" }));
    await page.getByRole("button", { name: "Delete Test" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(async () => {
      await page.goto(ADMIN_COURSE_URL);
      expect(await drillLink(page).count()).toBe(0);
    }).toPass({ timeout: 20000 });
  }
}

/** The student's answer form for one question type on the test page. */
function freeTextForm(page: Page) {
  return page.locator('form:has(textarea[name="answer"])');
}
function singleSelectForm(page: Page) {
  return page.locator('form:has(input[type="radio"])');
}
function multiSelectForm(page: Page) {
  return page.locator('form:has(input[type="checkbox"])');
}

// ── Reset: the scratch test must be gone before the clean captures ───────────

test.describe("student setup: reset", () => {
  test.use({ storageState: ADMIN_STATE });

  test("student: clear the scratch test from earlier runs", async ({
    page,
  }) => {
    await deleteDrillTests(page);
  });
});

// ── The seeded, never-written-to states ─────────────────────────────────────

test("student: dashboard with one enrolled course", async ({ page }) => {
  await page.goto("/student/dashboard");
  const yourCourses = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Your courses" }) });
  await expect(yourCourses.getByText("Sandbox: Fundamentals")).toBeVisible();
  await snap(page, "student/dashboard-one-course", {
    sources: DASHBOARD_SOURCES,
  });
});

test("student: course detail listing its tests", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}`);
  await expect(
    page.getByRole("heading", { name: "Sandbox: Fundamentals", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(VISIBLE_TEST_TITLE)).toBeVisible();
  await expect(page.getByText(HIDDEN_TEST_TITLE)).toBeVisible();
  await snap(page, "student/course-tests-list", { sources: COURSE_SOURCES });
});

test("student: test on first open, nothing answered", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${VISIBLE_TEST_ID}`);
  await expect(
    page.getByRole("heading", { name: VISIBLE_TEST_TITLE, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("0 / 3 questions answered")).toBeVisible();
  await snap(page, "student/test-not-started", { sources: TEST_PAGE_SOURCES });
});

test("student: a long answer typed into the free-text box", async ({
  page,
}) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${VISIBLE_TEST_ID}`);
  const textarea = page.getByPlaceholder("Type your answer here...");
  await hydrated(textarea);
  await textarea.fill(`${LONG_ANSWER}\n\n${UNBROKEN}`);
  await expect(textarea).not.toHaveValue("");
  await snap(page, "student/free-text-long-typed", {
    sources: TEST_PAGE_SOURCES,
  });
});

test("student: options ticked on both MC questions", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${VISIBLE_TEST_ID}`);
  const radios = page.getByRole("radio");
  const checkboxes = page.getByRole("checkbox");
  await hydrated(radios.nth(1));
  await radios.nth(1).check();
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await expect(radios.nth(1)).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await snap(page, "student/mc-options-selected", {
    sources: TEST_PAGE_SOURCES,
  });
});

test("student: submit confirm with nothing answered", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${VISIBLE_TEST_ID}`);
  await hydrated(page.getByRole("button", { name: "Submit Test for Grading" }));
  await page.getByRole("button", { name: "Submit Test for Grading" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("3 questions unanswered")).toBeVisible();
  await snap(page, "student/submit-confirm-unanswered", {
    sources: SUBMIT_SOURCES,
  });
});

// ── The scratch timed test: the states that need real writes ────────────────

test.describe("student setup: scratch timed test", () => {
  test.use({ storageState: ADMIN_STATE });

  test("student: admin creates the timed drill", async ({ page }) => {
    await page.goto(ADMIN_COURSE_URL);
    await hydrated(page.getByRole("button", { name: "Add Test" }));
    await page.getByRole("button", { name: "Add Test" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Test Title").fill(DRILL_TITLE);
    await dialog.getByLabel("Description").fill(DRILL_DESCRIPTION);
    await dialog.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 20000,
    });

    await expect(async () => {
      await page.goto(ADMIN_COURSE_URL);
      expect(await drillLink(page).count()).toBe(1);
    }).toPass({ timeout: 20000 });

    const href = await drillLink(page).first().getAttribute("href");
    drillTestId = href?.split("/").pop() ?? "";
    expect(drillTestId).not.toBe("");

    await page.goto(`${ADMIN_COURSE_URL}/tests/${drillTestId}`);
    await hydrated(page.locator("#question-title"));
    await page
      .locator("#question-title")
      .fill("Q1: Giải thích độ phức tạp O(n)");
    await page
      .locator("#question-content")
      .fill("Viết 2-3 câu giải thích O(n) nghĩa là gì.");
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 20000,
    });

    await page.getByLabel("Time limit (minutes)").fill(String(DRILL_MINUTES));
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({
      timeout: 20000,
    });
  });
});

test("student: start gate on a timed test", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${drillTestId}`);
  await expect(page.getByRole("heading", { name: "Timed test" })).toBeVisible();
  await snap(page, "student/timed-start-gate", { sources: TIMED_SOURCES });
});

test("student: countdown running after Start", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${drillTestId}`);
  await hydrated(page.getByRole("button", { name: "Start Test" }));
  await page.getByRole("button", { name: "Start Test" }).click();
  await expect(page.getByText("Time remaining:")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText("0 / 1 question answered")).toBeVisible();
  await snap(page, "student/timed-countdown", { sources: TIMED_SOURCES });
});

test("student: a saved answer in its read-only view", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${drillTestId}`);
  await hydrated(page.getByPlaceholder("Type your answer here..."));
  await page.getByPlaceholder("Type your answer here...").fill(DRILL_ANSWER);
  await freeTextForm(page)
    .getByRole("button", { name: "Submit Answer" })
    .click();
  await expect(page.getByRole("button", { name: "Edit Answer" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText(UNBROKEN)).toBeVisible();
  await expect(page.getByText("1 / 1 question answered")).toBeVisible();
  await snap(page, "student/answer-saved-readonly", {
    sources: TEST_PAGE_SOURCES,
  });
});

test("student: submit confirm with every question answered", async ({
  page,
}) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${drillTestId}`);
  await hydrated(page.getByRole("button", { name: "Submit Test for Grading" }));
  await page.getByRole("button", { name: "Submit Test for Grading" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("You have answered all")).toBeVisible();
  await snap(page, "student/submit-confirm-all-answered", {
    sources: SUBMIT_SOURCES,
  });
});

test("student: the test just after submitting", async ({ page }) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${drillTestId}`);
  await hydrated(page.getByRole("button", { name: "Submit Test for Grading" }));
  await page.getByRole("button", { name: "Submit Test for Grading" }).click();
  await page.getByRole("button", { name: "Confirm Submission" }).click();
  await expect(
    page.getByText("Your test has been submitted and is waiting to be graded."),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await snap(page, "student/submitted-waiting", { sources: SUBMITTED_SOURCES });
});

// ── The hidden test: everything the teacher can reveal is off ───────────────

test("student: submitted test with all result visibility off", async ({
  page,
}) => {
  await page.goto(`/student/courses/${COURSE_ID}/tests/${HIDDEN_TEST_ID}`);

  // Submitting is one-way, so this only runs on the first pass; afterwards the
  // seeded row is already in the state being captured.
  const submitButton = page.getByRole("button", {
    name: "Submit Test for Grading",
  });
  if ((await submitButton.count()) > 0) {
    await hydrated(page.getByPlaceholder("Type your answer here..."));
    await page.getByPlaceholder("Type your answer here...").fill(DRILL_ANSWER);
    await freeTextForm(page)
      .getByRole("button", { name: "Submit Answer" })
      .click();
    await expect(page.getByText("1 / 3 questions answered")).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole("radio").nth(1).check();
    await singleSelectForm(page)
      .getByRole("button", { name: "Submit Answer" })
      .click();
    await expect(page.getByText("2 / 3 questions answered")).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(2).check();
    await multiSelectForm(page)
      .getByRole("button", { name: "Submit Answer" })
      .click();
    await expect(page.getByText("3 / 3 questions answered")).toBeVisible({
      timeout: 20000,
    });

    await submitButton.click();
    await page.getByRole("button", { name: "Confirm Submission" }).click();
  }

  await expect(
    page.getByText("Your test has been submitted and is waiting to be graded."),
  ).toBeVisible({ timeout: 20000 });
  await snap(page, "student/hidden-test-submitted", {
    sources: SUBMITTED_SOURCES,
  });
});

// ── Cleanup: leave the shared course as it was found ────────────────────────

test.describe("student teardown", () => {
  test.use({ storageState: ADMIN_STATE });

  test("student: admin removes the scratch test", async ({ page }) => {
    await deleteDrillTests(page);
  });
});
