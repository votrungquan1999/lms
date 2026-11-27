import { expect, test } from "@playwright/test";
import {
  enroll,
  insertAnswer,
  insertCourse,
  insertGrade,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

const MINUTE = 60_000;

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

test.describe("Grading a student after a redo", () => {
  for (const route of routes) {
    test(`on ${route.name} a redo hand-in leaves only the changed answer needing a grade`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const q1 = await insertQuestion(db, testId, {
          title: "[redo] Question 1",
        });
        const q2 = await insertQuestion(db, testId, {
          title: "[redo] Question 2",
          order: 2,
        });
        const studentId = await insertStudent(db, { name: "Rhea Redo" });
        await enroll(db, { courseId, studentId });
        // Both answers graded, then Q2 rewritten and handed in again
        const answeredAt = new Date(Date.now() - 10 * MINUTE);
        const gradedAt = new Date(Date.now() - 5 * MINUTE);
        for (const questionId of [q1, q2]) {
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "first try" },
            submittedAt: answeredAt,
          });
          await insertGrade(db, { testId, questionId, studentId, gradedAt });
        }
        await insertAnswer(db, {
          testId,
          questionId: q2,
          studentId,
          answer: { type: "free_text", text: "rewritten after the redo" },
          submittedAt: new Date(Date.now() - MINUTE),
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId };
      });

      await page.goto(route.path(ids));

      // She opens on the changed answer, the only one waiting
      await expect(page.getByText("rewritten after the redo")).toBeVisible();
      await expect(page.getByRole("link", { name: "Q1 graded" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Q2 needs grading" }),
      ).toBeVisible();
      await expect(
        page.getByTestId("grade-card").getByLabel("Score (0–100):"),
      ).toBeEnabled();
      await expect(page.getByTestId("grading-progress-fraction")).toHaveText(
        "0 of 1 fully graded",
      );
    });
  }
});
