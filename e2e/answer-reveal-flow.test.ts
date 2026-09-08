/**
 * Feature: Answer Reveal display (E2E)
 *
 * A test's `answerRevealMode` controls how a graded free-text question's
 * correct answer is shown to the student once correct answers are visible:
 * "plain" (new tests' default) writes the correct answer out as text; "diff"
 * (legacy tests' default) lines the student's answer up side-by-side against
 * the solution instead. Both gate on the question actually being graded and
 * on correct answers being visible — which a freshly-created test already is
 * by default (`showCorrectAnswerAfterSubmit` defaults to true), so grading
 * the question is what "releases" the correct answer here.
 *
 * See `src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/graded-question.tsx`
 * for the rendered strings this spec asserts on ("Correct Answer" / "Diff
 * Comparison"), and `test-settings-panel.tsx` for the reveal-mode radio.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Must follow playwright.config.ts's E2E_PORT, or this spec would drive a
// different server than the one the suite started (see mc-edge-cases.test.ts).
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const authDir = path.join(__dirname, "../playwright/.auth");

const QUESTION_CONTENT = "What does the mitochondria do?";

// ─── Scenario A: Plain mode — correct answer written out ────────────────────
// New tests default to "plain" AND to no per-student solution being required
// — grading with the "Correct Solution" field left blank must still show the
// question's own authored Model Answer.

test.describe("Answer Reveal — plain mode", () => {
  test.describe.configure({ mode: "serial" });

  const COURSE_TITLE = "Reveal E2E Plain Course";
  const TEST_TITLE = "Reveal E2E Plain Test";
  const QUESTION_TITLE = "Reveal E2E Plain Question";
  const MODEL_ANSWER =
    "Mitochondria convert nutrients into ATP through cellular respiration.";
  const STUDENT_ANSWER = "Mitochondria make energy for the cell.";
  const STUDENT_USERNAME = "reveal-plain-student";
  const STUDENT_PASSWORD = "reveal-plain-password";
  const STUDENT_NAME = "Reveal E2E Plain Student";
  const STUDENT_AUTH = path.join(authDir, "reveal-plain-student.json");

  test("setup: admin creates a course, a plain-mode test, and a free-text question with a model answer", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("Answer reveal e2e — plain");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // Left untouched: a newly-created test's answerRevealMode defaults to
    // "plain" and showCorrectAnswerAfterSubmit defaults to true — this test
    // exercises those defaults, not an explicit settings change.
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByLabel("Question Title").fill(QUESTION_TITLE);
    await page.getByLabel("Content (Markdown)").fill(QUESTION_CONTENT);
    await page.getByLabel("Model Answer").fill(MODEL_ANSWER);
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("setup: admin creates and enrolls the student", async ({ page }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
    await page.keyboard.press("Escape");

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10000 });
  });

  test("student authenticates for the plain reveal scenario", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const studentPage = await ctx.newPage();
    await studentPage.goto(`${BASE_URL}/student/login`);
    await studentPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await studentPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await studentPage.getByRole("button", { name: "Sign In" }).click();
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10000 });
    fs.mkdirSync(authDir, { recursive: true });
    await ctx.storageState({ path: STUDENT_AUTH });
    await ctx.close();
  });

  test("student answers the free-text question and submits the test", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    // Exact + role="link": the dashboard also echoes the course title inside
    // the "Your courses" summary card, so a plain text match is ambiguous.
    await page.getByRole("link", { name: COURSE_TITLE, exact: true }).click();
    await page.getByText(TEST_TITLE).click();

    await page
      .getByPlaceholder("Type your answer here...")
      .fill(STUDENT_ANSWER);
    await page.getByRole("button", { name: "Submit Answer" }).click();
    await expect(page.getByRole("button", { name: "Edit Answer" })).toBeVisible(
      { timeout: 10000 },
    );

    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(
      page.getByRole("heading", { name: "Submit test for grading?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(
      page.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10000 });
    await ctx.close();
  });

  test("admin grades the answer without entering a per-student solution", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(
      page.getByRole("heading", { name: `Grade: ${TEST_TITLE}` }),
    ).toBeVisible();

    const gradeForm = page
      .getByTestId("grade-card")
      .filter({ hasText: QUESTION_TITLE });
    await gradeForm.getByLabel("Score (0–100):").fill("85");
    // "Correct Solution" is deliberately left blank — plain mode must fall
    // back to the question's own authored Model Answer.
    await gradeForm.getByRole("button", { name: "Save Grade" }).click();
    await expect(gradeForm.getByText("Grade saved")).toBeVisible({
      timeout: 10000,
    });
  });

  test("student sees the correct answer written out plainly, not a diff", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    // Exact + role="link": the dashboard also echoes the course title inside
    // the "Your courses" summary card, so a plain text match is ambiguous.
    await page.getByRole("link", { name: COURSE_TITLE, exact: true }).click();
    await page.getByText(TEST_TITLE).click();

    // Plain mode: the question's authored Model Answer, written out as text.
    await expect(page.getByText("Correct Answer", { exact: true })).toBeVisible(
      { timeout: 10000 },
    );
    await expect(page.getByText(MODEL_ANSWER)).toBeVisible();

    // And NOT the side-by-side diff — that's the other mode's presentation.
    await expect(page.getByText("Diff Comparison")).not.toBeVisible();

    await ctx.close();
  });
});

// ─── Scenario B: Diff mode — side-by-side comparison ─────────────────────────
// The test is explicitly switched to "diff" via the Test Settings panel, and
// the admin DOES enter a per-student solution that differs from the
// student's answer, so the diff has something real to show.

test.describe("Answer Reveal — diff mode", () => {
  test.describe.configure({ mode: "serial" });

  const COURSE_TITLE = "Reveal E2E Diff Course";
  const TEST_TITLE = "Reveal E2E Diff Test";
  const QUESTION_TITLE = "Reveal E2E Diff Question";
  const STUDENT_ANSWER = "Mitochondria absorb sunlight to make sugar.";
  const GRADED_SOLUTION =
    "Mitochondria convert nutrients into ATP through cellular respiration.";
  const STUDENT_USERNAME = "reveal-diff-student";
  const STUDENT_PASSWORD = "reveal-diff-password";
  const STUDENT_NAME = "Reveal E2E Diff Student";
  const STUDENT_AUTH = path.join(authDir, "reveal-diff-student.json");

  test("setup: admin creates a course and test, switches it to side-by-side comparison, and adds the question", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("Answer reveal e2e — diff");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // Switch this test's reveal mode to side-by-side comparison ("diff") via
    // the Test Settings panel — the setting the product exposes for this.
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("radio", { name: "Side-by-side comparison" }).click();
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel("Question Title").fill(QUESTION_TITLE);
    await page.getByLabel("Content (Markdown)").fill(QUESTION_CONTENT);
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("setup: admin creates and enrolls the student", async ({ page }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
    await page.keyboard.press("Escape");

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10000 });
  });

  test("student authenticates for the diff reveal scenario", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const studentPage = await ctx.newPage();
    await studentPage.goto(`${BASE_URL}/student/login`);
    await studentPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await studentPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await studentPage.getByRole("button", { name: "Sign In" }).click();
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10000 });
    fs.mkdirSync(authDir, { recursive: true });
    await ctx.storageState({ path: STUDENT_AUTH });
    await ctx.close();
  });

  test("student answers the free-text question and submits the test", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    // Exact + role="link": the dashboard also echoes the course title inside
    // the "Your courses" summary card, so a plain text match is ambiguous.
    await page.getByRole("link", { name: COURSE_TITLE, exact: true }).click();
    await page.getByText(TEST_TITLE).click();

    await page
      .getByPlaceholder("Type your answer here...")
      .fill(STUDENT_ANSWER);
    await page.getByRole("button", { name: "Submit Answer" }).click();
    await expect(page.getByRole("button", { name: "Edit Answer" })).toBeVisible(
      { timeout: 10000 },
    );

    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(
      page.getByRole("heading", { name: "Submit test for grading?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(
      page.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10000 });
    await ctx.close();
  });

  test("admin grades the answer with a per-student solution that differs from the answer", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(
      page.getByRole("heading", { name: `Grade: ${TEST_TITLE}` }),
    ).toBeVisible();

    const gradeForm = page
      .getByTestId("grade-card")
      .filter({ hasText: QUESTION_TITLE });
    await gradeForm.getByLabel("Score (0–100):").fill("60");
    await gradeForm
      .getByPlaceholder("Enter the correct solution")
      .fill(GRADED_SOLUTION);
    await gradeForm.getByRole("button", { name: "Save Grade" }).click();
    await expect(gradeForm.getByText("Grade saved")).toBeVisible({
      timeout: 10000,
    });
  });

  test("student sees the side-by-side diff, not the correct answer written out", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    // Exact + role="link": the dashboard also echoes the course title inside
    // the "Your courses" summary card, so a plain text match is ambiguous.
    await page.getByRole("link", { name: COURSE_TITLE, exact: true }).click();
    await page.getByText(TEST_TITLE).click();

    // Diff mode: the student-vs-solution comparison.
    await expect(page.getByText("Diff Comparison")).toBeVisible({
      timeout: 10000,
    });

    // And NOT the plain-mode "Correct Answer" panel — that's the other
    // mode's presentation.
    await expect(
      page.getByText("Correct Answer", { exact: true }),
    ).not.toBeVisible();

    await ctx.close();
  });
});
