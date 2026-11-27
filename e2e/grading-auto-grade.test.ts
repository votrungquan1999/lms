import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
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
    path: (ids: { courseId: string; testId: string; studentId: string }) =>
      `/admin/grading/${ids.testId}?studentId=${ids.studentId}`,
  },
  {
    name: "the course Tests tab grading",
    path: (ids: { courseId: string; testId: string; studentId: string }) =>
      `/admin/courses/${ids.courseId}/tests/${ids.testId}/grading?studentId=${ids.studentId}`,
  },
];

test.describe("Auto-grade with AI from More", () => {
  for (const route of routes) {
    test(`on ${route.name} drafts a suggestion for the student's written answer`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[auto] Question",
        });
        const studentId = await insertStudent(db, { name: "Auto Student" });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "a loop that counts" },
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId, studentId, questionId };
      });

      await page.goto(route.path(ids));
      const more = page.getByRole("button", { name: /More/ });
      await hydrated(more);
      await more.click();
      await page.getByRole("menuitem", { name: "Auto-grade with AI" }).click();

      // The mock grades every answer 60, so the card shows that suggestion.
      const panel = page.getByTestId("ai-suggestion-panel");
      await expect(panel.getByText("60 / 100")).toBeVisible({ timeout: 15000 });
      await expect(panel.getByText(/MSW mock: AI grade/)).toBeVisible();

      // The first round is over, so More, which had only that entry, is gone.
      await expect(page.getByRole("button", { name: /More/ })).toHaveCount(0);
    });
  }
});
