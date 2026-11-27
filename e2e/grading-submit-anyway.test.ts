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
    path: (ids: { courseId: string; testId: string }) =>
      `/admin/grading/${ids.testId}`,
  },
  {
    name: "the course Tests tab grading",
    path: (ids: { courseId: string; testId: string }) =>
      `/admin/courses/${ids.courseId}/tests/${ids.testId}/grading`,
  },
];

test.describe("Grading a student who is still writing", () => {
  for (const route of routes) {
    test(`on ${route.name} a direct link shows her answer with the grade panel locked until Grade anyway, then saving needs no further confirm`, async ({
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
        `${route.path({ courseId, testId })}?studentId=${studentId}`,
      );
      await expect(
        page.getByRole("button", { name: "Student picker" }),
      ).toBeVisible();

      await expect(page.getByText("half-finished thought")).toBeVisible();
      const gradeCard = page.getByTestId("grade-card");
      await expect(gradeCard.getByLabel("Score (0–100):")).toBeDisabled();
      await expect(
        gradeCard.getByRole("button", { name: /^Save & next/ }),
      ).toBeDisabled();

      await gradeCard.getByRole("button", { name: "Grade anyway" }).click();
      await gradeCard.getByLabel("Score (0–100):").fill("73");
      const save = gradeCard.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await save.click();
      await expect(
        page.getByRole("link", { name: /^Q\d+ graded$/ }).first(),
      ).toBeVisible({ timeout: 10000 });

      await page.reload();
      await expect(
        page.getByTestId("grade-card").getByLabel("Score (0–100):"),
      ).toHaveValue("73");
    });

    test(`on ${route.name} the still-writing confirm on a short screen stays inside it and scrolls`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[still-writing-short] Question",
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
        return { courseId, testId };
      });

      await page.goto(route.path(ids));
      const picker = page.getByRole("button", { name: "Student picker" });
      await hydrated(picker);
      await picker.click();
      await page.getByRole("menuitem", { name: /Vo Thanh Tamw/ }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();

      await page.setViewportSize({ width: 1280, height: 100 });
      await expect
        .poll(async () => (await dialog.boundingBox())?.y ?? -1)
        .toBeGreaterThanOrEqual(0);
      const box = await dialog.boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(100);
      // What does not fit scrolls inside the dialog
      expect(
        await dialog.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
    });

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
      // The choice survives the navigation, so her panel opens without a second ask
      await expect(
        page.getByTestId("grade-card").getByLabel("Score (0–100):"),
      ).toBeEnabled();
    });

    test(`on ${route.name} a student the teacher already confirmed opens from the picker without asking again`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[still-writing] Asked once",
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
        return { courseId, testId, waiting, writing };
      });

      // Given the teacher confirmed Grade anyway for her once
      await page.goto(route.path(ids));
      const picker = page.getByRole("button", { name: "Student picker" });
      await hydrated(picker);
      await picker.click();
      await page.getByRole("menuitem", { name: /Vo Thanh Tamw/ }).click();
      await page.getByRole("button", { name: "Grade anyway" }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.writing}`));

      // And moved to another student
      await picker.click();
      await page.getByRole("menuitem", { name: /Wanda Waiting/ }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.waiting}`));

      // When she picks her again
      await picker.click();
      await page.getByRole("menuitem", { name: /Vo Thanh Tamw/ }).click();

      // Then she opens at once, with no dialog
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.writing}`));
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });
  }
});
