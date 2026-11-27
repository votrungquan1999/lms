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

test.describe("Compare with AI fix", () => {
  test("opens the student's answer and the AI's fixed answer side by side without widening the page", async ({
    page,
  }) => {
    const { testId, studentId } = await withDb(async (db) => {
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
      return { testId, studentId };
    });

    await page.goto(`/admin/grading/${testId}?studentId=${studentId}`);
    const compare = page.getByRole("button", { name: "Compare with AI fix" });
    await hydrated(compare);
    await compare.click();

    await expect(page.getByText("Compare Student's answer")).toBeVisible();
    await expect(
      page.getByText(
        "AI suggested fix · not shown to Compare Student until you use it",
      ),
    ).toBeVisible();
    await expect(page.getByText("1 line differs")).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
