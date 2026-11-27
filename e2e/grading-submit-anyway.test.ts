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

test.describe("Grading a student who is still writing", () => {
  test("pressing Submit Anyway in the confirm dialog saves the grade", async ({
    page,
  }) => {
    const { courseId, testId, studentId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const questionId = await insertQuestion(db, testId, {
        title: "[submit-anyway] Question",
      });
      const studentId = await insertStudent(db);
      await enroll(db, { courseId, studentId });
      // An answer without a submission leaves the student In Progress.
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "half-finished thought" },
      });
      return { courseId, testId, studentId };
    });

    await page.goto(
      `/admin/courses/${courseId}/tests/${testId}/grading?studentId=${studentId}`,
    );
    await expect(
      page.getByRole("button", { name: "Student picker" }),
    ).toBeVisible();

    const gradeCard = page.getByTestId("grade-card");
    await gradeCard.getByLabel("Score (0–100):").fill("73");
    const save = gradeCard.getByRole("button", { name: /^Save & next/ });
    await hydrated(save);
    await save.click();
    await page.getByRole("button", { name: "Submit Anyway" }).click();
    await expect(
      page.getByRole("link", { name: /^Q\d+ graded$/ }).first(),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(
      page.getByTestId("grade-card").getByLabel("Score (0–100):"),
    ).toHaveValue("73");
  });

  for (const route of [
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
  ]) {
    test(`on ${route.name} picking her from the picker asks first and opens her only after Grade anyway`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[still-writing] Question",
        });
        const waiting = await insertStudent(db, { name: "Wanda Waiting" });
        const writing = await insertStudent(db, { name: "Vo Thanh Tamw" });
        for (const studentId of [waiting, writing]) {
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "answer" },
          });
        }
        await insertSubmission(db, { testId, studentId: waiting });
        return { courseId, testId, writing };
      });

      await page.goto(route.path(ids));
      const picker = page.getByRole("button", { name: "Student picker" });
      await hydrated(picker);
      await picker.click();
      await page.getByRole("menuitem", { name: /Vo Thanh Tamw/ }).click();

      // The dialog asks first; Cancel leaves the open student in place
      const dialog = page.getByRole("alertdialog");
      await expect(
        dialog.getByRole("heading", {
          name: "Vo Thanh Tamw is still writing. Grade anyway?",
        }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(page).not.toHaveURL(new RegExp(`studentId=${ids.writing}`));

      // Grade anyway opens her
      await picker.click();
      await page.getByRole("menuitem", { name: /Vo Thanh Tamw/ }).click();
      await page.getByRole("button", { name: "Grade anyway" }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.writing}`));
    });
  }
});
