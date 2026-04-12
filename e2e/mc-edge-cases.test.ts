import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { expect, test } from "@playwright/test";

// ─── Shared constants ────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3001";
const MONGODB_URI = "mongodb://localhost:27017/lms_e2e";
const authDir = path.join(__dirname, "../playwright/.auth");

// ─── Scenario A: Delayed grade reveal ────────────────────────────────────────
// Tests the full flow: teacher creates test with delayed release, student
// submits, sees "waiting", teacher releases grades, student sees score.

test.describe("MC Edge Cases — Delayed grade reveal", () => {
  test.describe.configure({ mode: "serial" });

  const STUDENT_NAME = "EC Delayed Student";
  const STUDENT_USERNAME = "ec-delayed-student";
  const STUDENT_PASSWORD = "ec-delayed-password";
  const EC_STUDENT_AUTH = path.join(authDir, "ec-delayed-student.json");

  // ── Step 0: Admin creates test with delayed grade release ─────────────────

  test("admin can create a test with delayed grade release", async ({
    page,
  }) => {
    // Given: admin creates a course for this scenario
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill("EC Delayed Course");
    await page.getByLabel("Description").fill("Edge case delayed release course");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");

    // Navigate into the course
    await page.goto("/admin/courses");
    await page.getByText("EC Delayed Course").click();

    // When: admin opens "Add Test" and unchecks "Show grades immediately"
    await page.getByRole("button", { name: "Add Test" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Test" }),
    ).toBeVisible();
    await page.getByLabel("Test Title").fill("EC Delayed Test");

    // The new "Show grades immediately" checkbox must exist and be unchecked
    await page.getByLabel("Show grades immediately").uncheck();
    await page.getByRole("button", { name: "Create Test" }).click();

    // Then: test is created successfully
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── Setup: Admin creates the student for this scenario ───────────────────

  test("admin creates student for delayed reveal scenario", async ({ page }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
  });

  test("student authenticates for delayed reveal scenario", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const studentPage = await ctx.newPage();
    await studentPage.goto(`${BASE_URL}/student/login`);
    await studentPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await studentPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await studentPage.getByRole("button", { name: "Sign In" }).click();
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10_000 });
    fs.mkdirSync(authDir, { recursive: true });
    await ctx.storageState({ path: EC_STUDENT_AUTH });
    await ctx.close();
  });

  test("admin enrolls student in EC delayed course", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText("EC Delayed Course").click();
    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10_000 });
  });

  test("admin adds a single-select MC question to EC Delayed Test", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText("EC Delayed Course").click();
    await page.getByText("EC Delayed Test").click();

    // Add a single-select MC question
    await page.getByRole("button", { name: "Single Select" }).click();
    await page.getByLabel("Question Title").fill("EC Q1: Capital of France");
    await page
      .getByLabel("Content (Markdown)")
      .fill("What is the capital of France?");
    const optionInputs = page.getByPlaceholder(/Option \d/);
    await optionInputs.nth(0).fill("Berlin");
    await optionInputs.nth(1).fill("Paris");
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("student answers and submits EC Delayed Test", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: EC_STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.getByText("EC Delayed Course").click();
    await page.getByText("EC Delayed Test").click();

    const q1Card = page
      .locator("div[data-slot='card']")
      .filter({ hasText: "EC Q1: Capital of France" });
    await q1Card.getByLabel("Paris").check();
    await q1Card.getByRole("button", { name: "Submit Answer" }).click();
    await expect(
      q1Card.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Submit Test for Grading" }).click();
    await expect(
      page.getByRole("heading", { name: "Submit test for grading?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(
      page.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });

  // ── Step 2: Student still sees "waiting" (grades hidden) ─────────────────

  test("student sees 'waiting' message while grades are hidden", async ({
    browser,
  }) => {
    // Given: the test is submitted, showGradeAfterSubmit=false → grades hidden
    const ctx = await browser.newContext({ storageState: EC_STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.getByText("EC Delayed Course").click();
    await page.getByText("EC Delayed Test").click();

    // Then: still sees "waiting to be graded" (no score visible)
    await expect(
      page.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });

  // ── Step 1 + Step 2b: Admin releases grades, student sees score ──────────

  test("admin sees Release Grades button and releases grades", async ({
    page,
  }) => {
    // Given: admin is on the grading page for EC Delayed Test
    await page.goto("/admin/courses");
    await page.getByText("EC Delayed Course").click();
    await page.getByText("EC Delayed Test").click();
    await page.getByRole("link", { name: "Grade Students" }).click();
    await expect(
      page.getByRole("heading", { name: "Grade: EC Delayed Test" }),
    ).toBeVisible();

    // When: admin clicks "Release Grades" (visible only for delayed-release tests)
    await page.getByRole("button", { name: "Release Grades" }).click();

    // Then: button disappears (gradesReleasedAt is now set → page re-renders without it)
    await expect(
      page.getByRole("button", { name: "Release Grades" }),
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("student sees score after admin releases grades", async ({ browser }) => {
    // Given: grades were just released
    const ctx = await browser.newContext({ storageState: EC_STUDENT_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);
    await page.getByText("EC Delayed Course").click();
    await page.getByText("EC Delayed Test").click();

    // Then: student now sees the score (100 for correct MC answer)
    await expect(page.getByText("Average Score: 100.0 / 100")).toBeVisible({
      timeout: 10_000,
    });
    await ctx.close();
  });
});

// ─── Scenario B: Partial correct multi-select ─────────────────────────────────
// Student selects 1 of 2 correct options on a partial-scoring multi-select.
// Expected score: 50/100 (1/2 correct, no wrong selections).

test.describe("MC Edge Cases — Partial correct multi-select", () => {
  const STUDENT_USERNAME = "ec-partial-student";
  const STUDENT_PASSWORD = "ec-partial-password";
  const EC_PARTIAL_AUTH = path.join(authDir, "ec-partial-student.json");

  // IDs we'll need to cross-reference between seed data and auth
  let courseId: string;
  let testId: string;
  let questionId: string;
  let optionAId: string; // correct
  let optionBId: string; // correct
  // optionCId is wrong — we won't select it

  test.beforeAll(async ({ browser }) => {
    const adminAuthPath = path.join(authDir, "admin.json");

    // ── 1. Create student via admin UI using admin auth state ─────────────────
    const adminCtx = await browser.newContext({ storageState: adminAuthPath });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto(`${BASE_URL}/admin/students`);
    await adminPage.getByRole("button", { name: "Add Student" }).first().click();
    await adminPage.getByLabel("Full Name").fill("EC Partial Student");
    await adminPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await adminPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await adminPage.getByRole("button", { name: "Create Student" }).click();
    await adminPage
      .getByText("created successfully")
      .waitFor({ timeout: 10_000 });
    await adminCtx.close();

    // ── 2. Save student auth state by logging in via the student login form ───
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await studentPage.goto(`${BASE_URL}/student/login`);
    await studentPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await studentPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await studentPage.getByRole("button", { name: "Sign In" }).click();
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10_000 });
    fs.mkdirSync(authDir, { recursive: true });
    await studentCtx.storageState({ path: EC_PARTIAL_AUTH });
    await studentCtx.close();

    // ── 3. Seed course, enrollment, test, question, answer, submission via MongoDB
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Get student id from DB
    const studentDoc = await db
      .collection("student")
      .findOne({ username: STUDENT_USERNAME });
    if (!studentDoc) throw new Error("Student not found after UI creation");
    const studentId = studentDoc.id as string;

    courseId = crypto.randomUUID();
    testId = crypto.randomUUID();
    questionId = crypto.randomUUID();
    optionAId = crypto.randomUUID();
    optionBId = crypto.randomUUID();
    const optionCId = crypto.randomUUID();
    const now = new Date();

    await db.collection("course").insertOne({
      id: courseId,
      title: "EC Partial Course",
      description: "Partial score edge case course",
      createdAt: now,
      createdBy: "seed",
      updatedAt: null,
      updatedBy: null,
    });

    await db.collection("enrollment").insertOne({
      id: crypto.randomUUID(),
      courseId,
      studentId,
      enrolledAt: now,
      enrolledBy: "seed",
    });

    await db.collection("test").insertOne({
      id: testId,
      courseId,
      title: "EC Partial Test",
      description: "Partial scoring test",
      showCorrectAnswerAfterSubmit: true,
      showGradeAfterSubmit: true,
      correctAnswersReleasedAt: null,
      gradesReleasedAt: null,
      createdAt: now,
      createdBy: "seed",
      updatedAt: null,
      updatedBy: null,
    });

    // Multi-select question: optionA + optionB correct, optionC wrong
    // mcGradingStrategy: partial → score = (correct_selected/total_correct)*100 - (wrong/total_correct)*100
    await db.collection("question").insertOne({
      id: questionId,
      testId,
      title: "EC Q: Pick the planets",
      content: "Which are planets? Select all correct.",
      order: 1,
      type: "multi_select",
      options: [
        { id: optionAId, text: "Earth", isCorrect: true },
        { id: optionBId, text: "Mars", isCorrect: true },
        { id: optionCId, text: "Sun", isCorrect: false },
      ],
      mcGradingStrategy: "partial",
      weight: 1,
      createdAt: now,
      createdBy: "seed",
      updatedAt: null,
      updatedBy: null,
    });

    // Student selects only optionA (1 of 2 correct, no wrong) → 50/100
    await db.collection("answer").insertOne({
      id: crypto.randomUUID(),
      testId,
      questionId,
      studentId,
      answer: { type: "mc", selectedIds: [optionAId] },
      submittedAt: now,
    });

    // Mark test as submitted → triggers auto-grade in the domain, but since
    // we seed directly we also insert the grade and submission manually.
    await db.collection("test_submission").insertOne({
      id: crypto.randomUUID(),
      testId,
      studentId,
      submittedAt: now,
    });

    // Insert the auto-grade: 1 correct out of 2, no wrong → 50/100
    await db.collection("grade").insertOne({
      id: crypto.randomUUID(),
      testId,
      questionId,
      studentId,
      score: 50,
      feedback: "",
      solution: null,
      gradedAt: now,
      gradedBy: "system",
      updatedAt: null,
      updatedBy: null,
    });

    await client.close();
  });

  // ── Step 3: Student sees partial score ───────────────────────────────────

  test("student sees partial score for partially-correct multi-select answer", async ({
    browser,
  }) => {
    // Given: student is logged in and visits the seeded partially-answered test
    const ctx = await browser.newContext({ storageState: EC_PARTIAL_AUTH });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/student/dashboard`);

    // When: student navigates to the partially-answered test
    await page.getByText("EC Partial Course").click();
    await page.getByText("EC Partial Test").click();

    // Then: sees their partial score — 50/100 (1 of 2 correct, no wrong selections)
    await expect(page.getByText("Average Score: 50.0 / 100")).toBeVisible({
      timeout: 10_000,
    });

    // And the per-question grade also shows 50/100
    await expect(page.getByText("50/100")).toBeVisible();

    await ctx.close();
  });
});
