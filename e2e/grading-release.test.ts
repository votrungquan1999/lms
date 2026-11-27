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

test.describe("Releasing a test from the grading screen", () => {
  for (const route of routes) {
    test(`on ${route.name} the release dialog releases grades and correct answers in one click`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId, {
          title: "[release] Test",
          showGradeAfterSubmit: false,
          showCorrectAnswerAfterSubmit: false,
        });
        const questionId = await insertQuestion(db, testId, {
          title: "[release] Question",
        });
        const studentId = await insertStudent(db);
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "an answer" },
        });
        await insertSubmission(db, { testId, studentId });
        await insertGrade(db, { testId, questionId, studentId });
        return { courseId, testId };
      });

      await page.goto(route.path(ids));
      await expect(page.getByTestId("release-state")).toHaveText(
        "Not released",
      );

      const trigger = page.getByRole("button", { name: /^Release .+▾$/ });
      await hydrated(trigger);
      await trigger.click();
      await page.getByRole("menuitem", { name: /Release grades…/ }).click();
      const dialog = page.getByRole("dialog", {
        name: "Release grades · [release] Test",
      });
      await dialog
        .getByRole("checkbox", { name: /Also show correct answers/ })
        .click();
      await dialog.getByRole("button", { name: "Release" }).click();

      // Both release times are stamped; the chip and the menu follow.
      await expect(page.getByTestId("release-state")).toHaveText("Released");
      await expect(
        page.getByRole("button", { name: /^Release .+▾$/ }),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          withDb(async (db) => {
            const test = await db
              .collection("test")
              .findOne({ id: ids.testId });
            return [
              test?.gradesReleasedAt instanceof Date,
              test?.correctAnswersReleasedAt instanceof Date,
            ];
          }),
        )
        .toEqual([true, true]);
    });
  }
});
