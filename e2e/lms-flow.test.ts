import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const STUDENT_NAME = "Test Student";
const STUDENT_USERNAME = "e2e-student";
const STUDENT_PASSWORD = "e2e-student-password";

const authDir = path.join(__dirname, "../playwright/.auth");

test.describe("LMS E2E Flow", () => {
  test.describe.configure({ mode: "serial" });

  // ─── Step 4: Admin creates a student ─────────────────────────────────────

  test("admin can create a student via dashboard", async ({ page }) => {
    // Given the admin navigates to the students page
    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();

    // When clicking "Add Student" and filling the form
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Create Student Account" }),
    ).toBeVisible();

    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();

    // Then a success message appears
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // Dismiss the dialog, then verify the student appears in the list
    await page.keyboard.press("Escape");
    await page.goto("/admin/students");
    await expect(page.getByText(`@${STUDENT_USERNAME}`)).toBeVisible();
  });

  // ─── Step 5: Student authenticates via login form ─────────────────────────

  test("student can authenticate via login form", async ({ browser }) => {
    // Given a fresh browser context (no admin cookies)
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();

    // When navigating to student login and filling credentials
    await studentPage.goto("http://localhost:3001/student/login");
    await studentPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await studentPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await studentPage.getByRole("button", { name: "Sign In" }).click();

    // Then redirected to student dashboard
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10000 });
    await expect(
      studentPage.getByRole("heading", {
        name: `Welcome, ${STUDENT_USERNAME}!`,
      }),
    ).toBeVisible();

    // Save student auth state for later tests
    fs.mkdirSync(authDir, { recursive: true });
    await studentContext.storageState({
      path: path.join(authDir, "student.json"),
    });

    await studentContext.close();
  });

  // ─── Step 6: Admin creates a course ───────────────────────────────────────

  test("admin can create a course via dashboard", async ({ page }) => {
    // Given the admin navigates to the courses page
    await page.goto("/admin/courses");
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

    // When clicking "Add Course" and filling the form
    await page.getByRole("button", { name: "Add Course" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Course" }),
    ).toBeVisible();

    await page.getByLabel("Course Title").fill("E2E Test Course");
    await page.getByLabel("Description").fill("A course created by e2e tests");
    await page.getByRole("button", { name: "Create Course" }).click();

    // Then a success message appears
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // And after navigating back, the course appears in the list
    await page.goto("/admin/courses");
    await expect(page.getByText("E2E Test Course")).toBeVisible();
  });

  // ─── Step 7: Admin enrolls student in course ──────────────────────────────

  test("admin can enroll student in course", async ({ page }) => {
    // Given the admin navigates to the course detail
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await expect(
      page.getByRole("heading", { name: "E2E Test Course" }),
    ).toBeVisible();

    // When clicking "Manage Enrollments" and ticking the student
    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await expect(
      page.getByRole("heading", { name: "Manage Enrollments" }),
    ).toBeVisible();

    // Tick the student checkbox
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();

    // Then a success message appears
    await expect(page.getByText("updated")).toBeVisible({
      timeout: 10000,
    });

    // And after reloading, the student is in the enrolled list
    await page.reload();
    await expect(page.getByText(`@${STUDENT_USERNAME}`)).toBeVisible();
  });

  // ─── Step 8: Student sees enrolled course on dashboard ────────────────────

  test("student sees enrolled course on dashboard", async ({ browser }) => {
    // Given the student is logged in (using saved storageState)
    const context = await browser.newContext({
      storageState: path.join(authDir, "student.json"),
    });
    const page = await context.newPage();

    // When the student navigates to their dashboard
    await page.goto("http://localhost:3001/student/dashboard");

    // Then the welcome heading is shown
    await expect(
      page.getByRole("heading", { name: `Welcome, ${STUDENT_USERNAME}!` }),
    ).toBeVisible();

    // And the enrolled course appears
    await expect(page.getByText("E2E Test Course")).toBeVisible();

    await context.close();
  });

  // ─── Step 9: Student navigates to course detail ───────────────────────────

  test("student can click into course detail", async ({ browser }) => {
    // Given the student is on the dashboard
    const context = await browser.newContext({
      storageState: path.join(authDir, "student.json"),
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3001/student/dashboard");
    await expect(page.getByText("E2E Test Course")).toBeVisible();

    // When they click on the course
    await page.getByText("E2E Test Course").click();

    // Then the course detail page loads
    await expect(
      page.getByRole("heading", { name: "E2E Test Course" }),
    ).toBeVisible();

    // And shows "No tests" since none have been created yet
    await expect(
      page.getByText("No tests available for this course yet"),
    ).toBeVisible();

    await context.close();
  });

  // ─── Step 10: Admin creates a test in a course ────────────────────────────

  test("admin can create a test in a course", async ({ page }) => {
    // Given the admin navigates to the course detail
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await expect(
      page.getByRole("heading", { name: "E2E Test Course" }),
    ).toBeVisible();

    // When clicking "Add Test" and filling the form
    await page.getByRole("button", { name: "Add Test" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Test" }),
    ).toBeVisible();

    await page.getByLabel("Test Title").fill("E2E Midterm");
    await page.getByLabel("Description").fill("A test created by e2e");
    await page.getByRole("button", { name: "Create Test" }).click();

    // Then a success message appears
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // And after reloading, the test appears
    await page.reload();
    await expect(page.getByText("E2E Midterm")).toBeVisible();
  });

  // ─── Step 11: Admin adds questions to a test ──────────────────────────────

  test("admin can add a free text question to a test", async ({ page }) => {
    // Given the admin is on the course detail and clicks into the test
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await expect(
      page.getByRole("heading", { name: "E2E Test Course" }),
    ).toBeVisible();
    await page.getByText("E2E Midterm").click();
    await expect(
      page.getByRole("heading", { name: "E2E Midterm" }),
    ).toBeVisible();

    // When filling the add question form
    await page.getByLabel("Question Title").fill("Q1: Hello World");
    await page
      .getByLabel("Content (Markdown)")
      .fill("Write a function that returns the string `hello world`.");
    await page.getByRole("button", { name: "Add Question" }).click();

    // Then a success message appears
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });

    // And the form clears automatically (no reload needed)
    await expect(page.getByLabel("Question Title")).toHaveValue("");
    await expect(page.getByLabel("Content (Markdown)")).toHaveValue("");

    // And the question appears in the list after reload
    await page.reload();
    await expect(page.getByText("Q1: Hello World")).toBeVisible();
  });

  // ─── Step 11a-pre: Admin adds a question with no content (title-only) ──────

  test("admin can add a question with title only (empty content)", async ({
    page,
  }) => {
    // Given the admin is on the course detail
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await expect(
      page.getByRole("heading", { name: "E2E Test Course" }),
    ).toBeVisible();

    // Create a separate test for this so it doesn't break the Midterm grading math
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill("E2E Title Only Test");
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.getByText("E2E Title Only Test").click();

    // When filling only the title (no content)
    await page.getByLabel("Question Title").fill("Q1b: Title-only Question");
    // Leave Content (Markdown) empty
    await page.getByRole("button", { name: "Add Question" }).click();

    // Then a success message appears
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });

    // And the question appears in the list
    await page.reload();
    await expect(page.getByText("Q1b: Title-only Question")).toBeVisible();
  });

  // ─── Step 11a: Admin also adds a MC (single-select) question ────────────────

  test("admin can create a single-select MC question via sidebar UI", async ({
    page,
  }) => {
    // Given the admin is on the test detail page (E2E Midterm)
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await page.getByText("E2E Midterm").click();
    await expect(
      page.getByRole("heading", { name: "E2E Midterm" }),
    ).toBeVisible();

    // When the admin selects "Single Select" in the question type sidebar
    await page.getByRole("button", { name: "Single Select" }).click();

    // Then the options builder panel appears on the right
    await expect(page.getByText("Options")).toBeVisible();

    // Fill in the question title and content
    await page.getByLabel("Question Title").fill("Q2: MC Capital of France");
    await page
      .getByLabel("Content (Markdown)")
      .fill("What is the capital of France?");

    // Fill options (two default options should exist)
    const optionInputs = page.getByPlaceholder(/Option \d/);
    await optionInputs.nth(0).fill("Berlin");
    await optionInputs.nth(1).fill("Paris");

    // Mark "Paris" (option 2) as correct via its radio button
    await page.getByRole("radio").nth(1).check();

    // Submit the question
    await page.getByRole("button", { name: "Add Question" }).click();

    // Then a success message appears
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });

    // And the form clears automatically (no reload needed)
    await expect(page.getByLabel("Question Title")).toHaveValue("");
    await expect(page.getByLabel("Content (Markdown)")).toHaveValue("");

    // And after reload both questions appear in the list
    await page.reload();
    await expect(page.getByText("Q2: MC Capital of France")).toBeVisible();
  });

  // ─── Step 11b: Admin adds a multi-select MC question ──────────────────────

  test("admin can create a multi-select MC question via sidebar UI", async ({
    page,
  }) => {
    // Given the admin is on the test detail page (E2E Midterm)
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await page.getByText("E2E Midterm").click();
    await expect(
      page.getByRole("heading", { name: "E2E Midterm" }),
    ).toBeVisible();

    // When the admin selects "Multi Select" in the question type sidebar
    await page.getByRole("button", { name: "Multi Select" }).click();

    // Then the options builder panel appears (label is specific to multi-select)
    await expect(page.getByText("Options (pick all correct)")).toBeVisible();

    // Fill in the question title and content
    await page.getByLabel("Question Title").fill("Q3: MC Planets");
    await page
      .getByLabel("Content (Markdown)")
      .fill(
        "Which of the following are planets in our solar system? Select all that apply.",
      );

    // Add a third option (two default ones exist)
    await page.getByRole("button", { name: "Add Option" }).click();

    const optionInputs = page.getByPlaceholder(/Option \d/);
    await optionInputs.nth(0).fill("Earth");
    await optionInputs.nth(1).fill("Mars");
    await optionInputs.nth(2).fill("Sun");

    // Mark Earth and Mars as correct via their checkboxes
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();

    // Submit the question
    await page.getByRole("button", { name: "Add Question" }).click();

    // Then a success message appears
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });

    // And the form clears automatically (no reload needed)
    await expect(page.getByLabel("Question Title")).toHaveValue("");
    await expect(page.getByLabel("Content (Markdown)")).toHaveValue("");

    // And after reload all three questions appear in the list
    await page.reload();
    await expect(page.getByText("Q3: MC Planets")).toBeVisible();
  });

  // ─── Step 12: Student takes test (answer Q1 free-text + Q2 MC + submit) ───

  test("student can answer questions and submit test", async ({ browser }) => {
    // Given the student navigates: dashboard → course → test
    const context = await browser.newContext({
      storageState: path.join(authDir, "student.json"),
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByText("E2E Test Course").click();
    await expect(
      page.getByRole("heading", { name: "E2E Test Course" }),
    ).toBeVisible();

    // Click the test (shown with "Not Started" status)
    await page.getByText("E2E Midterm").click();
    await expect(
      page.getByRole("heading", { name: "E2E Midterm" }),
    ).toBeVisible();

    // ── Answer Q1 (free-text) ───────────────────────────────────────
    // Card component renders as div[data-slot="card"]
    const q1Card = page
      .locator("div[data-slot='card']")
      .filter({ hasText: "Q1: Hello World" });
    await q1Card
      .getByPlaceholder("Type your answer here...")
      .fill("console.log('hello world')");
    await q1Card.getByRole("button", { name: "Submit Answer" }).click();
    await expect(
      q1Card.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible({ timeout: 10000 });

    // ── Answer Q2 (MC single-select) ─────────────────────────────────────
    const q2Card = page
      .locator("div[data-slot='card']")
      .filter({ hasText: "Q2: MC Capital of France" });
    await q2Card.getByLabel("Paris").check();
    await q2Card.getByRole("button", { name: "Submit Answer" }).click();
    await expect(
      q2Card.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible({ timeout: 10000 });

    // ── Answer Q3 (MC multi-select) ───────────────────────────────────────
    const q3Card = page
      .locator("div[data-slot='card']")
      .filter({ hasText: "Q3: MC Planets" });
    await q3Card.getByLabel("Earth").check();
    await q3Card.getByLabel("Mars").check();
    await q3Card.getByRole("button", { name: "Submit Answer" }).click();
    await expect(
      q3Card.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible({ timeout: 10000 });

    // ── Submit the entire test for grading ────────────────────────────────
    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(
      page.getByRole("heading", { name: "Submit test for grading?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();

    // Then see the "waiting to be graded" message — Q2 & Q3 are MC (auto-graded) but
    // Q1 (free-text) still needs manual grading → atomic reveal: no scores shown yet
    await expect(
      page.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  // ─── Step 13: Admin grades the submitted test ─────────────────────────────

  test("admin can grade the student's submitted test", async ({ page }) => {
    // Given the admin navigates to the grading page: courses → course → test → Grade Students
    await page.goto("/admin/courses");
    await page.getByText("E2E Test Course").click();
    await page.getByText("E2E Midterm").click();
    await expect(
      page.getByRole("heading", { name: "E2E Midterm" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(
      page.getByRole("heading", { name: "Grade: E2E Midterm" }),
    ).toBeVisible();

    // The student's free-text answer for Q1 should be visible
    await expect(page.getByText("console.log('hello world')")).toBeVisible();

    // Scope all interactions to the Q1 form to avoid ambiguity with the Q2 (MC) form
    const q1Form = page.getByTestId("grade-card").filter({
      hasText: "Q1: Hello World",
    });

    // When the admin fills in the grade for Q1
    await q1Form.getByLabel("Score (0–100):").fill("85");
    await q1Form
      .getByPlaceholder("Feedback for this question")
      .fill("Good job, but use return instead of console.log");
    await q1Form
      .getByPlaceholder("Enter the correct solution")
      .fill("function hello() { return 'hello world'; }");
    await q1Form.getByRole("button", { name: "Save Grade" }).click();

    // Then a success message appears
    await expect(q1Form.getByText("Grade saved")).toBeVisible({
      timeout: 10000,
    });
  });

  // ─── Step 17: Atomic reveal — score visible after admin grades Q1 ─────────

  test("student sees weighted score visible after admin grades free-text question", async ({
    browser,
  }) => {
    // Now both Q1 (graded by admin in step 13) and Q2 (MC, auto-graded) have grades.
    // With showGradeAfterSubmit=true, all grades present → atomic reveal unlocks.
    const context = await browser.newContext({
      storageState: path.join(authDir, "student.json"),
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByText("E2E Test Course").click();
    await page.getByText("E2E Midterm").click();
    await expect(
      page.getByRole("heading", { name: "E2E Midterm" }),
    ).toBeVisible();

    // All questions graded → weighted average: Q1=85, Q2=100, Q3=100 → Math.round(285/3)=95 → displayed as toFixed(1)
    await expect(page.getByText("Average Score: 95.0 / 100")).toBeVisible({
      timeout: 10000,
    });

    await context.close();
  });
});
