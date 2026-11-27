import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  expectNoPageOverflow,
  insertAiGrade,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

const routes = [
  {
    name: "the grading page",
    path: (ids: { courseId: string; testId: string }) =>
      `/admin/grading/${ids.testId}`,
  },
  {
    name: "the course Tests tab grading",
    path: (ids: { courseId: string; testId: string }) =>
      `/admin/courses/${ids.courseId}/tests/${ids.testId}/grading`,
  },
];

const FIX_TITLE =
  "AI suggested fix · not shown to Compare Student until you use it";

/** One student whose answer differs from the AI's fix by one line. */
async function seedCompare() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId);
    const questionId = await insertQuestion(db, testId, {
      title: "[compare] Question",
    });
    const studentId = await insertStudent(db, { name: "Compare Student" });
    await enroll(db, { courseId, studentId });
    const answerId = await insertAnswer(db, {
      testId,
      questionId,
      studentId,
      answer: { type: "free_text", text: "line one\nline two\nline three" },
    });
    await insertSubmission(db, { testId, studentId });
    await insertAiGrade(db, {
      testId,
      questionId,
      studentId,
      gradedAgainstAnswerId: answerId,
      solution: "line one\nline 2\nline three",
    });
    return { courseId, testId, studentId };
  });
}

test.describe("Compare with AI fix", () => {
  for (const route of routes) {
    test(`on ${route.name} opens the student's answer and the AI's fixed answer side by side without widening the page`, async ({
      page,
    }) => {
      const { courseId, testId, studentId } = await seedCompare();

      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}`,
      );
      const compare = page.getByRole("button", { name: "Compare with AI fix" });
      await hydrated(compare);
      await compare.click();

      await expect(page.getByText("Compare Student's answer")).toBeVisible();
      await expect(page.getByText(FIX_TITLE)).toBeVisible();
      await expect(page.getByText("1 line differs")).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }

  for (const route of routes) {
    test(`on ${route.name} on a tablet the comparison is one column, still naming both sides and that the fix is hidden from the student`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 834, height: 1194 });
      const { courseId, testId, studentId } = await seedCompare();

      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}`,
      );
      const compare = page.getByRole("button", { name: "Compare with AI fix" });
      await hydrated(compare);
      await compare.click();

      await expect(
        page.getByText(
          "1 line differs · not shown to Compare Student until you use it",
        ),
      ).toBeVisible();
      await expect(
        page.getByText("− Compare Student's answer · + AI suggested fix"),
      ).toBeVisible();
      // One column: the second column's title is gone
      await expect(page.getByText(FIX_TITLE)).toHaveCount(0);
      await expectNoPageOverflow(page);
    });
  }
});
