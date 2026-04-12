/**
 * Feature: Needs Redo Flow
 *
 * As an admin
 * I want to request a student to redo a test
 * So that the student sees a clear prompt to resubmit their answers
 *
 * Self-contained — creates its own course, test, and student.
 * Each step navigates fresh (same pattern as lms-flow.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const STUDENT_USERNAME = "redo-student";
const STUDENT_PASSWORD = "redo-student-password";
const STUDENT_NAME = "Redo Student";
const COURSE_TITLE = "Redo Flow Course";
const TEST_TITLE = "Redo Flow Test";
// Regex for clicking the test card link (its accessible name includes summary text)
const TEST_TITLE_RE = /Redo Flow Test/;

const authDir = path.join(__dirname, "../playwright/.auth");

test.describe("Redo Flow", () => {
  test.describe.configure({ mode: "serial" });

  // ─── Setup ─────────────────────────────────────────────────────────────────

  test("setup: admin creates a student account", async ({ page }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({ timeout: 10000 });
  });

  test("setup: admin creates a course", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For redo flow testing");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({ timeout: 10000 });
  });

  test("setup: admin enrolls the student in the course", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(page.getByRole("heading", { name: COURSE_TITLE })).toBeVisible();

    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10000 });
  });

  test("setup: admin creates a test and adds a question", async ({ page }) => {
    // Create the test
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(page.getByRole("heading", { name: COURSE_TITLE })).toBeVisible();

    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByLabel("Description").fill("Used for redo flow e2e");
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({ timeout: 10000 });

    // Navigate fresh into the test (clicking the card link by role to avoid strict-mode issues)
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(page.getByRole("heading", { name: COURSE_TITLE })).toBeVisible();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });

    // Add a free-text question
    await page.getByLabel("Question Title").fill("Describe recursion");
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({ timeout: 10000 });
  });

  test("setup: student authenticates and saves auth state", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3001/student/login");
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/student/dashboard", { timeout: 10000 });

    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({ path: path.join(authDir, "redo-student.json") });

    await context.close();
  });

  test("setup: student answers and submits the test", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, "redo-student.json"),
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3001/student/dashboard");
    // Card links on student dashboard include extra text — use regex to match
    await page.getByRole("link", { name: /Redo Flow Course/ }).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("Type your answer here...").fill("A function that calls itself.");
    await page.getByRole("button", { name: "Submit Answer" }).click();
    await expect(page.getByRole("button", { name: "Edit Answer" })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(page.getByRole("heading", { name: "Submit test for grading?" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(page.getByText("submitted and is waiting to be graded")).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  // ─── Scenario 1: Admin sees Request Redo button ────────────────────────────

  test("admin sees a 'Request Redo' button for the student on the grading page", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(page.getByRole("heading", { name: `Grade: ${TEST_TITLE}` })).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole("button", { name: "Request Redo" })).toBeVisible();
  });

  // ─── Scenario 2: Admin clicks Request Redo ────────────────────────────────

  test("admin can request a redo — button is replaced by confirmation text", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(page.getByRole("heading", { name: `Grade: ${TEST_TITLE}` })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Request Redo" }).click();

    await expect(page.getByText("Redo requested")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Request Redo" })).not.toBeVisible();
  });

  // ─── Scenario 3: Student sees Redo Required banner ────────────────────────

  test("student sees a 'Redo Required' banner after admin requested a redo", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, "redo-student.json"),
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByRole("link", { name: /Redo Flow Course/ }).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Redo Required")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Your teacher has requested that you redo this test")).toBeVisible();

    await context.close();
  });

  // ─── Scenario 4: Request persists after page reload ───────────────────────

  test("grading page still shows 'Redo requested' after a page reload", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(page.getByRole("heading", { name: `Grade: ${TEST_TITLE}` })).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Redo requested")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Request Redo" })).not.toBeVisible();
  });

  // ─── Scenario 5: Student can re-answer and resubmit after redo ─────────────

  test("student can re-answer and resubmit the test after a redo request", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, "redo-student.json"),
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByRole("link", { name: /Redo Flow Course/ }).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });

    // The redo banner should be visible
    await expect(page.getByText("Redo Required")).toBeVisible({ timeout: 10000 });

    // Answer forms should be re-enabled despite previous submission
    // The form shows in read-only mode with "Edit Answer" — click it to unlock
    await page.getByRole("button", { name: "Edit Answer" }).click();
    await page.getByPlaceholder("Type your answer here...").fill("Recursion is when a function calls itself with a base case.");
    await page.getByRole("button", { name: "Submit Answer" }).click();
    await expect(page.getByRole("button", { name: "Edit Answer" })).toBeVisible({ timeout: 10000 });

    // Submit the test again
    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(page.getByRole("heading", { name: "Submit test for grading?" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(page.getByText("submitted and is waiting to be graded")).toBeVisible({ timeout: 10000 });

    // After resubmission, the redo banner should be gone
    await expect(page.getByText("Redo Required")).not.toBeVisible();

    await context.close();
  });
});

