import fs from "node:fs";
import path from "node:path";
import { type Browser, expect, test } from "@playwright/test";
import type { StudentDocument } from "../src/lib/student-service";
import {
  enroll,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertTest,
  withDb,
} from "./seed";

const STUDENT_USERNAME = "navigator-student";
const STUDENT_PASSWORD = "navigator-student-password";
const STUDENT_NAME = "[navigator] Student";
const authDir = path.join(__dirname, "../playwright/.auth");
const STUDENT_AUTH = path.join(authDir, "navigator-student.json");

// Tall enough that three questions push the last one well below the fold.
const LONG_CONTENT = Array.from(
  { length: 40 },
  (_, i) => `Line ${i + 1} of the question.`,
).join("\n\n");

interface SeedOptions {
  questionCount: number;
  answeredOrders: number[];
}

/**
 * Seeds a course with the navigator student enrolled and one untimed test.
 * @param options - How many questions to add and which ones have a saved answer.
 * @returns The course and test ids to open.
 */
async function seedTest({ questionCount, answeredOrders }: SeedOptions) {
  return withDb(async (db) => {
    const student = await db
      .collection<StudentDocument>("student")
      .findOne({ username: STUDENT_USERNAME });
    if (!student) throw new Error("Student not found after UI creation");

    const courseId = await insertCourse(db, { title: "[navigator] Course" });
    await enroll(db, { courseId, studentId: student.id });
    const testId = await insertTest(db, courseId, {
      title: "[navigator] Test",
    });
    for (let order = 1; order <= questionCount; order++) {
      const questionId = await insertQuestion(db, testId, {
        order,
        title: `[navigator] Q${order}`,
        content: LONG_CONTENT,
      });
      if (answeredOrders.includes(order)) {
        await insertAnswer(db, {
          testId,
          questionId,
          studentId: student.id,
          answer: { type: "free_text", text: `answer ${order}` },
        });
      }
    }
    return { courseId, testId };
  });
}

/**
 * Opens a test page as the logged-in navigator student.
 * @param browser - The Playwright browser.
 * @param ids - The course and test to open.
 * @returns The page and its context, for closing.
 */
async function openAsStudent(
  browser: Browser,
  ids: { courseId: string; testId: string },
) {
  const context = await browser.newContext({ storageState: STUDENT_AUTH });
  const page = await context.newPage();
  await page.goto(`/student/courses/${ids.courseId}/tests/${ids.testId}`);
  return { context, page };
}

test.describe("Question navigator", () => {
  test.describe.configure({ mode: "serial" });

  // A real, UI-created and logged-in student: the test page needs an actual
  // Better Auth session, which a raw Mongo insert cannot produce.
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

  test("an untimed test shows a pinned bar with the answered count and one box per question, the saved one marked answered", async ({
    browser,
  }) => {
    const ids = await seedTest({ questionCount: 3, answeredOrders: [2] });
    const { context, page } = await openAsStudent(browser, ids);

    const bar = page.getByRole("navigation", { name: "Question navigator" });
    await expect(bar).toContainText("1 / 3 answered");
    await expect(bar.getByRole("link")).toHaveText(["1", "2", "3"]);
    await expect(
      bar.getByRole("link", { name: "Question 2, answered" }),
    ).toBeVisible();
    await expect(
      bar.getByRole("link", { name: "Question 1, not answered" }),
    ).toBeVisible();
    await expect(
      bar.getByRole("link", { name: "Question 3, not answered" }),
    ).toBeVisible();

    // Still on screen after scrolling to the bottom of the test.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(page.getByText("[navigator] Q1")).not.toBeInViewport();
    await expect(bar).toBeInViewport();

    await context.close();
  });

  test("a box fills only once its answer is saved, not while the student is still typing", async ({
    browser,
  }) => {
    const ids = await seedTest({ questionCount: 2, answeredOrders: [] });
    const { context, page } = await openAsStudent(browser, ids);
    const bar = page.getByRole("navigation", { name: "Question navigator" });
    const q1Card = page
      .locator("div[data-slot='card']")
      .filter({ hasText: "[navigator] Q1" });

    await q1Card.getByPlaceholder("Type your answer here...").fill("draft");
    await expect(bar).toContainText("0 / 2 answered");
    await expect(
      bar.getByRole("link", { name: "Question 1, not answered" }),
    ).toBeVisible();

    await q1Card.getByRole("button", { name: "Submit Answer" }).click();
    await expect(bar).toContainText("1 / 2 answered", { timeout: 10_000 });
    await expect(
      bar.getByRole("link", { name: "Question 1, answered" }),
    ).toBeVisible();

    await context.close();
  });

  test("clicking a question's box brings that question into view below the bar", async ({
    browser,
  }) => {
    const ids = await seedTest({ questionCount: 3, answeredOrders: [] });
    const { context, page } = await openAsStudent(browser, ids);
    const bar = page.getByRole("navigation", { name: "Question navigator" });
    const q3Title = page.getByText("[navigator] Q3");
    await expect(q3Title).not.toBeInViewport();

    await bar.getByRole("link", { name: "Question 3, not answered" }).click();

    await expect(q3Title).toBeInViewport();
    // The pinned bar must not sit on top of the title it jumped to.
    const barBox = await bar.boundingBox();
    const titleBox = await q3Title.boundingBox();
    if (!barBox || !titleBox) throw new Error("bar or title has no box");
    expect(titleBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);

    await context.close();
  });
});
