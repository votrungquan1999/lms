import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
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

test.describe("Requesting a redo from More", () => {
  for (const route of routes) {
    test(`on ${route.name} a redo is requested only after the confirm dialog`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId, {
          title: "[request-redo] Test",
        });
        const questionId = await insertQuestion(db, testId, {
          title: "[request-redo] Question",
        });
        const studentId = await insertStudent(db, { name: "Rena Redo" });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "an answer" },
        });
        await insertSubmission(db, { testId, studentId });
        await insertGrade(db, { testId, questionId, studentId });
        return { courseId, testId, studentId };
      });
      const openRedoCount = () =>
        withDb((db) =>
          db
            .collection("redo_request")
            .countDocuments({ testId: ids.testId, resolvedAt: null }),
        );

      await page.goto(route.path(ids));
      const more = page.getByRole("button", { name: /^More/ });
      await hydrated(more);
      await more.click();
      await page.getByRole("menuitem", { name: "Request redo…" }).click();

      // The dialog names her and the test, and Cancel writes nothing
      const dialog = page.getByRole("dialog", {
        name: "Ask Rena Redo to redo [request-redo] Test?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      expect(await openRedoCount()).toBe(0);

      await more.click();
      await page.getByRole("menuitem", { name: "Request redo…" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Request redo" })
        .click();

      await expect.poll(openRedoCount).toBe(1);
      await page.getByRole("button", { name: "Student picker" }).click();
      await expect(page.getByText("Redo requested · 1")).toBeVisible();
    });
  }
});
