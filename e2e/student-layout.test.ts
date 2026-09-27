import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { GradeDocument } from "../src/lib/grade-service";
import type { StudentDocument } from "../src/lib/student-service";
import type { TestSubmissionDocument } from "../src/lib/test-submission-service";
import {
  enroll,
  expectNoPageOverflow,
  expectNotClipped,
  expectWrapped,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertTest,
  withDb,
} from "./seed";

const STUDENT_USERNAME = "layout-student";
const STUDENT_PASSWORD = "layout-student-password";
const STUDENT_NAME = "[layout] Student";
const authDir = path.join(__dirname, "../playwright/.auth");
const STUDENT_AUTH = path.join(authDir, "layout-student.json");

test.describe("Student layout", () => {
  test.describe.configure({ mode: "serial" });

  // One real, UI-created and logged-in student — the pages under test require
  // an actual Better Auth session, which a raw Mongo insert cannot produce.
  test.beforeAll(async ({ browser }) => {
    const adminCtx = await browser.newContext({
      storageState: path.join(authDir, "admin.json"),
    });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto("/admin/students");
    await adminPage
      .getByRole("button", { name: "Add Student" })
      .first()
      .click();
    await adminPage.getByLabel("Full Name").fill(STUDENT_NAME);
    await adminPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await adminPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await adminPage.getByRole("button", { name: "Create Student" }).click();
    await expect(adminPage.getByText("created successfully")).toBeVisible({
      timeout: 10_000,
    });
    await adminCtx.close();

    // storageState: undefined avoids inheriting the project's admin session
    const studentCtx = await browser.newContext({ storageState: undefined });
    const studentPage = await studentCtx.newPage();
    await studentPage.goto("/student/login");
    await studentPage.getByLabel("Username").fill(STUDENT_USERNAME);
    await studentPage.getByLabel("Password").fill(STUDENT_PASSWORD);
    await studentPage.getByRole("button", { name: "Sign In" }).click();
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10_000 });
    fs.mkdirSync(authDir, { recursive: true });
    await studentCtx.storageState({ path: STUDENT_AUTH });
    await studentCtx.close();
  });

  test("a 145-character unbroken saved answer never overflows its panel", async ({
    browser,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenAddress = "x".repeat(145);
    const { courseId, testId } = await withDb(async (db) => {
      const student = await db
        .collection<StudentDocument>("student")
        .findOne({ username: STUDENT_USERNAME });
      if (!student) throw new Error("Student not found after UI creation");

      const courseId = await insertCourse(db, {
        title: "[layout] Student Course",
      });
      await enroll(db, { courseId, studentId: student.id });
      const testId = await insertTest(db, courseId, {
        title: "[layout] Student Test",
      });
      const questionId = await insertQuestion(db, testId, {
        title: "[layout] Address question",
      });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId: student.id,
        answer: { type: "free_text", text: unbrokenAddress },
      });
      return { courseId, testId };
    });

    const context = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await context.newPage();
    await page.goto(`/student/courses/${courseId}/tests/${testId}`);

    const panel = page.getByText(unbrokenAddress, { exact: true });
    await expect(panel).toBeVisible();
    await expectNotClipped(panel);

    await context.close();
  });

  test("the student breadcrumbs wrap a long unbroken course and test title instead of scrolling the page sideways", async ({
    browser,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenTitle = `[layout] ${"averylongunbrokenstudenttesttitletoken".repeat(8)}`;
    const unbrokenCourseTitle = `[layout] ${"averylongunbrokenstudentcoursetitletoken".repeat(8)}`;
    const { courseId, testId } = await withDb(async (db) => {
      const student = await db
        .collection<StudentDocument>("student")
        .findOne({ username: STUDENT_USERNAME });
      if (!student) throw new Error("Student not found after UI creation");

      const courseId = await insertCourse(db, {
        title: unbrokenCourseTitle,
      });
      await enroll(db, { courseId, studentId: student.id });
      const testId = await insertTest(db, courseId, {
        title: unbrokenTitle,
      });
      await insertQuestion(db, testId);
      return { courseId, testId };
    });

    const context = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await context.newPage();
    await page.goto(`/student/courses/${courseId}/tests/${testId}`);

    // Test page: both the course link and the current test title wrap.
    const trail = page.getByRole("navigation", { name: "breadcrumb" });
    const crumb = trail.getByText(unbrokenTitle, { exact: true });
    await expect(crumb).toBeVisible();
    await expectWrapped(crumb);
    await expectWrapped(trail.getByRole("link", { name: unbrokenCourseTitle }));
    await expectNoPageOverflow(page);

    // Course page: its current course title wraps too.
    await page.goto(`/student/courses/${courseId}`);
    const courseCrumb = page
      .getByRole("navigation", { name: "breadcrumb" })
      .getByText(unbrokenCourseTitle, { exact: true });
    await expect(courseCrumb).toBeVisible();
    await expectWrapped(courseCrumb);
    await expectNoPageOverflow(page);

    await context.close();
  });

  test("the graded view shows a long question title in full, wrapped instead of cut off with an ellipsis", async ({
    browser,
  }) => {
    const longTitle = `[layout] ${"AVeryLongUnbrokenQuestionTitleToken".repeat(7)}`;
    const { courseId, testId } = await withDb(async (db) => {
      const student = await db
        .collection<StudentDocument>("student")
        .findOne({ username: STUDENT_USERNAME });
      if (!student) throw new Error("Student not found after UI creation");

      const courseId = await insertCourse(db, {
        title: "[layout] Graded View Course",
      });
      await enroll(db, { courseId, studentId: student.id });
      const testId = await insertTest(db, courseId, {
        title: "[layout] Graded View Test",
      });
      const questionId = await insertQuestion(db, testId, {
        title: longTitle,
      });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId: student.id,
        answer: { type: "free_text", text: "My answer" },
      });
      // Grade + submit directly — a one-off insert (extract-at-3 not met).
      await db.collection<GradeDocument>("grade").insertOne({
        id: crypto.randomUUID(),
        testId,
        questionId,
        studentId: student.id,
        score: 90,
        feedback: "",
        solution: null,
        gradedAt: new Date(),
        gradedBy: "seed",
        updatedAt: null,
        updatedBy: null,
      });
      await db.collection<TestSubmissionDocument>("test_submission").insertOne({
        id: crypto.randomUUID(),
        testId,
        studentId: student.id,
        submittedAt: new Date(),
        deletedAt: null,
        releasedAt: null,
        releasedBy: null,
      });
      return { courseId, testId };
    });

    const context = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await context.newPage();
    await page.goto(`/student/courses/${courseId}/tests/${testId}`);

    const title = page.getByText(`Question 1: ${longTitle}`, {
      exact: true,
    });
    await expect(title).toBeVisible();
    await expectWrapped(title);
    await expectNoPageOverflow(page);

    await context.close();
  });

  test("a multiple-choice option with one long unbroken word wraps inside its card, in both the editing list and the saved-picks view", async ({
    browser,
  }) => {
    // No hyphens/spaces: browsers treat those as soft break points even
    // without a wrap utility, so a broken string would not reproduce this.
    const editingOptionText =
      "averylongunbrokenmceditingoptiontokenthatmustwrapinsteadofoverflowing".repeat(
        2,
      );
    const savedOptionText =
      "averylongunbrokenmcsavedpicksoptiontokenthatmustwrapinsteadofoverflowing".repeat(
        2,
      );

    const { courseId, testId } = await withDb(async (db) => {
      const student = await db
        .collection<StudentDocument>("student")
        .findOne({ username: STUDENT_USERNAME });
      if (!student) throw new Error("Student not found after UI creation");

      const courseId = await insertCourse(db, {
        title: "[layout] MC Option Course",
      });
      await enroll(db, { courseId, studentId: student.id });
      const testId = await insertTest(db, courseId, {
        title: "[layout] MC Option Test",
      });

      // Unanswered — renders the editing radio list.
      await insertQuestion(db, testId, {
        title: "[layout] MC Editing Question",
        order: 1,
        type: "single_select",
        options: [
          { id: crypto.randomUUID(), text: editingOptionText, isCorrect: true },
          { id: crypto.randomUUID(), text: "Short", isCorrect: false },
        ],
      });

      // Pre-answered — renders the read-only saved-picks view.
      const savedOptionId = crypto.randomUUID();
      const savedQuestionId = await insertQuestion(db, testId, {
        title: "[layout] MC Saved Picks Question",
        order: 2,
        type: "single_select",
        options: [
          { id: savedOptionId, text: savedOptionText, isCorrect: true },
          { id: crypto.randomUUID(), text: "Short", isCorrect: false },
        ],
      });
      await insertAnswer(db, {
        testId,
        questionId: savedQuestionId,
        studentId: student.id,
        answer: { type: "mc", selectedIds: [savedOptionId] },
      });

      return { courseId, testId };
    });

    const context = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await context.newPage();
    await page.goto(`/student/courses/${courseId}/tests/${testId}`);

    const editingCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "[layout] MC Editing Question" });
    const editingOption = editingCard.getByText(editingOptionText, {
      exact: true,
    });
    await expect(editingOption).toBeVisible();
    const editingCardBox = await editingCard.boundingBox();
    const editingOptionBox = await editingOption.boundingBox();
    expect(
      (editingOptionBox?.x ?? 0) + (editingOptionBox?.width ?? 0),
    ).toBeLessThanOrEqual(
      (editingCardBox?.x ?? 0) + (editingCardBox?.width ?? 0) + 1,
    );

    const savedCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "[layout] MC Saved Picks Question" });
    // Pins the read-only saved-picks view, not a second editing list.
    await expect(
      savedCard.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible();
    const savedOption = savedCard.getByText(savedOptionText, { exact: true });
    await expect(savedOption).toBeVisible();
    const savedCardBox = await savedCard.boundingBox();
    const savedOptionBox = await savedOption.boundingBox();
    expect(
      (savedOptionBox?.x ?? 0) + (savedOptionBox?.width ?? 0),
    ).toBeLessThanOrEqual(
      (savedCardBox?.x ?? 0) + (savedCardBox?.width ?? 0) + 1,
    );

    await context.close();
  });

  test("a markdown table with one long unbroken cell never pushes the table past its card", async ({
    browser,
  }) => {
    // No hyphens/spaces: browsers treat those as soft break points even
    // without a wrap utility, so a broken string would not reproduce this.
    const longCellText = "averylongunbrokenmarkdowntablecellvaluetoken".repeat(
      3,
    );
    const tableContent = `| Column A | Column B |\n| --- | --- |\n| ${longCellText} | short |`;

    const { courseId, testId } = await withDb(async (db) => {
      const student = await db
        .collection<StudentDocument>("student")
        .findOne({ username: STUDENT_USERNAME });
      if (!student) throw new Error("Student not found after UI creation");

      const courseId = await insertCourse(db, {
        title: "[layout] Markdown Table Course",
      });
      await enroll(db, { courseId, studentId: student.id });
      const testId = await insertTest(db, courseId, {
        title: "[layout] Markdown Table Test",
      });
      await insertQuestion(db, testId, {
        title: "[layout] Markdown Table Question",
        content: tableContent,
      });
      return { courseId, testId };
    });

    const context = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await context.newPage();
    await page.goto(`/student/courses/${courseId}/tests/${testId}`);

    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "[layout] Markdown Table Question" });
    const table = card.locator("table");
    await expect(table).toBeVisible();
    await expect(card.getByText(longCellText, { exact: true })).toBeVisible();

    // The long cell wraps, so the table fits the box that holds it...
    const scrollContainer = table.locator("xpath=..");
    const cardBox = await card.boundingBox();
    const tableBox = await table.boundingBox();
    const containerBox = await scrollContainer.boundingBox();
    expect((tableBox?.x ?? 0) + (tableBox?.width ?? 0)).toBeLessThanOrEqual(
      (containerBox?.x ?? 0) + (containerBox?.width ?? 0) + 1,
    );
    expect(
      (containerBox?.x ?? 0) + (containerBox?.width ?? 0),
    ).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 1);
    // ...and that box scrolls sideways itself, so a table too wide to wrap
    // is reachable by scrolling, never clipped by the Card's overflow-hidden.
    await expect(scrollContainer).toHaveCSS("overflow-x", "auto");

    await context.close();
  });

  test("a multiple-choice option renders in the app's teal, matching the Submit button", async ({
    browser,
  }) => {
    const { courseId, testId } = await withDb(async (db) => {
      const student = await db
        .collection<StudentDocument>("student")
        .findOne({ username: STUDENT_USERNAME });
      if (!student) throw new Error("Student not found after UI creation");

      const courseId = await insertCourse(db, {
        title: "[layout] Accent Colour Course",
      });
      await enroll(db, { courseId, studentId: student.id });
      const testId = await insertTest(db, courseId, {
        title: "[layout] Accent Colour Test",
      });
      await insertQuestion(db, testId, {
        title: "[layout] Capital question",
        type: "single_select",
        options: [
          { id: crypto.randomUUID(), text: "Paris", isCorrect: true },
          { id: crypto.randomUUID(), text: "London", isCorrect: false },
        ],
      });
      return { courseId, testId };
    });

    const context = await browser.newContext({ storageState: STUDENT_AUTH });
    const page = await context.newPage();
    await page.goto(`/student/courses/${courseId}/tests/${testId}`);

    const radio = page.getByLabel("Paris");
    const submitButton = page.getByRole("button", { name: "Submit Answer" });
    await expect(radio).toBeVisible();
    await expect(submitButton).toBeVisible();

    const accentColor = await radio.evaluate(
      (el) => getComputedStyle(el).accentColor,
    );
    const submitBackground = await submitButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(accentColor).toBe(submitBackground);

    await context.close();
  });
});
