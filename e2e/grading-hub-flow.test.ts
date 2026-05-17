/**
 * Feature: Grading Hub Flow (E2E smoke)
 *
 * Admin lands on dashboard, clicks the new Grading card, sees the hub,
 * clicks the test card, lands on the variant grading page, and sees the
 * student's status badge.
 *
 * Self-contained — creates its own course, test, and student via UI, then
 * the student logs in and submits the test (without grading) so it appears
 * in the default Needs grading filter.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const STUDENT_USERNAME = "gh-student";
const STUDENT_PASSWORD = "gh-student-password";
const STUDENT_NAME = "Grading Hub Student";
const COURSE_TITLE = "Grading Hub Course";
const TEST_TITLE = "Grading Hub Test";
const TEST_TITLE_RE = /Grading Hub Test/;

const authDir = path.join(__dirname, "../playwright/.auth");

test.describe("Grading Hub Flow", () => {
  test.describe.configure({ mode: "serial" });

  // ─── Setup ─────────────────────────────────────────────────────────────────

  test("setup: admin creates a student account", async ({ page }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("setup: admin creates a course", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For grading hub e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("setup: admin enrolls the student", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(
      page.getByRole("heading", { name: COURSE_TITLE }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10000 });
  });

  test("setup: admin creates a test with a free-text question", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByLabel("Description").fill("For grading hub e2e");
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel("Question Title").fill("Describe Big-O");
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("setup: student authenticates and saves auth state", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3001/student/login");
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/student/dashboard", { timeout: 10000 });

    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({
      path: path.join(authDir, "gh-student.json"),
    });
    await context.close();
  });

  test("setup: student answers and submits the test", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, "gh-student.json"),
    });
    const page = await context.newPage();

    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByRole("link", { name: /Grading Hub Course/ }).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible({
      timeout: 10000,
    });

    await page
      .getByPlaceholder("Type your answer here...")
      .fill("Time complexity bound.");
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

    await context.close();
  });

  // ─── Assertions ────────────────────────────────────────────────────────────

  test("admin navigates Dashboard → Hub → Variant grading page and sees status badge", async ({
    page,
  }) => {
    // Block A: Dashboard → Hub
    await page.goto("/admin/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /Grading/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/grading$/, { timeout: 10000 });

    // Block B: Hub → Variant
    await expect(page.getByRole("heading", { name: /Grading/ })).toBeVisible();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await expect(page).toHaveURL(/\/admin\/grading\/[^/]+$/, {
      timeout: 10000,
    });

    // Block C: Variant page shows status badge for the submitted student
    await expect(
      page.getByRole("heading", { name: new RegExp(`Grade: ${TEST_TITLE}`) }),
    ).toBeVisible();
    // The student's card has a Submitted badge (data-status='submitted').
    const submittedBadge = page
      .locator(`[data-student-name="${STUDENT_NAME}"]`)
      .locator('[data-status="submitted"]');
    await expect(submittedBadge).toBeVisible({ timeout: 10000 });
    await expect(submittedBadge).toHaveText(/Submitted/i);
  });
});
