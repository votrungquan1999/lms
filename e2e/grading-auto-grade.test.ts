import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  insertAiGrade,
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

      // The first round is over, so More offers a new round instead.
      await page.getByRole("button", { name: /More/ }).click();
      await expect(
        page.getByRole("menuitem", { name: "Auto-grade with AI" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("menuitem", { name: "Regenerate all with AI…" }),
      ).toBeVisible();
    });
  }
});

test.describe("Regenerate all with AI from More", () => {
  for (const route of routes) {
    test(`on ${route.name} replaces the suggestion of an ungraded answer, and only graded answers once the box is ticked`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const ungradedQ = await insertQuestion(db, testId, {
          title: "[regen] Ungraded question",
        });
        const gradedQ = await insertQuestion(db, testId, {
          title: "[regen] Graded question",
        });
        const studentId = await insertStudent(db, { name: "Regen Student" });
        await enroll(db, { courseId, studentId });
        for (const questionId of [ungradedQ, gradedQ]) {
          const answerId = await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "an answer" },
          });
          await insertAiGrade(db, {
            testId,
            questionId,
            studentId,
            gradedAgainstAnswerId: answerId,
          });
        }
        await insertGrade(db, {
          testId,
          questionId: gradedQ,
          studentId,
          score: 90,
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId, studentId, ungradedQ, gradedQ };
      });

      const regenerate = async (includeGraded: boolean) => {
        await page.getByRole("button", { name: /More/ }).click();
        await page
          .getByRole("menuitem", { name: "Regenerate all with AI…" })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel(/reason/i)
          .fill("Too lenient on partial credit");
        if (includeGraded) {
          await dialog
            .getByRole("checkbox", {
              name: "Also regenerate questions I've already graded",
            })
            .click();
        }
        await dialog.getByRole("button", { name: "Regenerate all" }).click();
        await expect(
          dialog.getByText(/AI grading started|regenerated/),
        ).toBeVisible({ timeout: 15000 });
        await page.keyboard.press("Escape");
      };
      const suggestionCount = (questionId: string) =>
        withDb(async (db) => {
          const rows = await db
            .collection("ai_grade")
            .find({ questionId, studentId: ids.studentId })
            .toArray();
          return rows.length;
        });

      await page.goto(route.path(ids));
      await hydrated(page.getByRole("button", { name: /More/ }));

      // Off: only the ungraded answer gets a new suggestion.
      await regenerate(false);
      await expect
        .poll(() => suggestionCount(ids.ungradedQ), { timeout: 15000 })
        .toBe(2);
      expect(await suggestionCount(ids.gradedQ)).toBe(1);

      // On: the graded answer gets one too.
      await regenerate(true);
      await expect
        .poll(() => suggestionCount(ids.gradedQ), { timeout: 15000 })
        .toBe(2);
    });
  }
});
