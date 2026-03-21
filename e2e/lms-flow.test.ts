import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

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

    // And after reload, the student appears in the list
    await page.waitForTimeout(4000);
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

  test("admin can add a question to a test", async ({ page }) => {
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

    // And the question appears in the list
    await page.reload();
    await expect(page.getByText("Q1: Hello World")).toBeVisible();
  });

  // ─── Step 12: Student takes test (answer + submit) ────────────────────────

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

    // When the student fills in the answer
    await page
      .getByPlaceholder("Type your answer here...")
      .fill("console.log('hello world')");
    await page.getByRole("button", { name: "Submit Answer" }).click();

    // Wait for answer to be saved (form switches to read-only with Edit Answer button)
    await expect(page.getByRole("button", { name: "Edit Answer" })).toBeVisible(
      { timeout: 10000 },
    );

    // Then submit the test for grading
    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(
      page.getByRole("heading", { name: "Submit test for grading?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();

    // Then see the "waiting to be graded" message
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

    // The student's answer should be visible
    await expect(page.getByText("console.log('hello world')")).toBeVisible();

    // When the admin fills in the grade
    await page.getByLabel("Score (0–100):").fill("85");
    await page
      .getByPlaceholder("Feedback for this question")
      .fill("Good job, but use return instead of console.log");
    await page
      .getByPlaceholder("Enter the correct solution")
      .fill("function hello() { return 'hello world'; }");
    await page.getByRole("button", { name: "Save Grade" }).click();

    // Then a success message appears
    await expect(page.getByText("Grade saved")).toBeVisible({
      timeout: 10000,
    });
  });

  // ─── Step 14: Student sees grade and feedback ─────────────────────────────

  test("student can see their grade and feedback", async ({ browser }) => {
    // Given the student navigates to the test page
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

    // Then the grade score is visible
    await expect(page.getByText("85/100")).toBeVisible();

    // And the teacher feedback is visible
    await expect(
      page.getByText("Good job, but use return instead of console.log"),
    ).toBeVisible();

    await context.close();
  });
});
