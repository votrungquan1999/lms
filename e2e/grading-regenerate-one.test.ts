import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  insertAiGrade,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

const REASON = "Too harsh, the counting logic is fully correct.";

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

test.describe("Regenerating one answer", () => {
  for (const route of routes) {
    test(`on ${route.name} asks for a reason and previews the new suggestion without changing the grade`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[regen] Question",
        });
        const studentId = await insertStudent(db, { name: "Regen Student" });
        await enroll(db, { courseId, studentId });
        const answerId = await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "a loop that counts" },
        });
        await insertSubmission(db, { testId, studentId });
        await insertAiGrade(db, {
          testId,
          questionId,
          studentId,
          gradedAgainstAnswerId: answerId,
          score: 70,
          feedback: "Seeded first suggestion",
        });
        return { courseId, testId, studentId, questionId };
      });

      await page.goto(route.path(ids));
      const trigger = page.getByRole("button", {
        name: "Regenerate this answer",
      });
      await hydrated(trigger);
      await trigger.click();

      // The dialog shows the suggestion being replaced and counts the reason.
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByText("Current suggestion 70 — Seeded first suggestion"),
      ).toBeVisible();
      await dialog.getByLabel(/Reason/).fill(REASON);
      await expect(dialog.getByText(`${REASON.length} / 500`)).toBeVisible();
      await dialog
        .getByRole("button", { name: "Regenerate this answer" })
        .click();

      // The new suggestion is a preview that carries the reason and the old one's summary.
      const panel = page.getByTestId("ai-suggestion-panel");
      await expect(panel.getByText("New AI suggestion")).toBeVisible({
        timeout: 15000,
      });
      await expect(panel.getByText(`Reason: ${REASON}`)).toBeVisible();
      await expect(
        panel.getByRole("button", {
          name: "Use this · saves score, feedback & solution",
        }),
      ).toBeVisible();
      await expect(
        panel.getByText("Previous suggestion: 70 — Seeded first suggestion"),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "View history (1)" }),
      ).toBeVisible();

      // The saved grade is untouched until Use this.
      const grade = await withDb((db) =>
        db.collection("grade").findOne({
          testId: ids.testId,
          questionId: ids.questionId,
          studentId: ids.studentId,
        }),
      );
      expect(grade).toBeNull();
    });
  }
});
