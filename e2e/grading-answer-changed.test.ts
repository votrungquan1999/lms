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

test.describe("The grade panel of an answer changed after its grade", () => {
  for (const route of routes) {
    test(`on ${route.name} says the answer changed and pre-fills her old grade`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[changed] Question",
        });
        const studentId = await insertStudent(db, { name: "Cleo Changed" });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "first try" },
          submittedAt: new Date(Date.now() - 10 * MINUTE),
        });
        await insertGrade(db, {
          testId,
          questionId,
          studentId,
          score: 70,
          feedback: "solid first try",
          gradedAt: new Date(Date.now() - 5 * MINUTE),
        });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "rewritten after the grade" },
          submittedAt: new Date(Date.now() - MINUTE),
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId };
      });

      await page.goto(route.path(ids));

      const panel = page.getByTestId("grade-card");
      await expect(page.getByText("rewritten after the grade")).toBeVisible();
      await expect(
        panel.getByText("Answer changed after your grade"),
      ).toBeVisible();
      await expect(panel.getByLabel("Score (0–100):")).toHaveValue("70");
      await expect(
        panel.getByPlaceholder("Feedback for this question..."),
      ).toHaveValue("solid first try");
    });
  }

  for (const route of routes) {
    test(`on ${route.name} a grade saved while she changed her answer leaves the new answer flagged as changed`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[changed] While grading",
        });
        const studentId = await insertStudent(db, { name: "Dina Changing" });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "answer on screen" },
          submittedAt: new Date(Date.now() - 10 * MINUTE),
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId, questionId, studentId };
      });
      const answerLink = `${route.path(ids)}?studentId=${ids.studentId}&questionId=${ids.questionId}`;

      await page.goto(answerLink);
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("60");
      // Her new answer lands after the teacher's screen loaded and before the save.
      await withDb((db) =>
        insertAnswer(db, {
          testId: ids.testId,
          questionId: ids.questionId,
          studentId: ids.studentId,
          answer: { type: "free_text", text: "answer changed meanwhile" },
          submittedAt: new Date(Date.now() - MINUTE),
        }),
      );
      await save.click();
      await expect
        .poll(() =>
          withDb(
            async (db) =>
              (await db.collection("grade").findOne({ testId: ids.testId }))
                ?.score ?? null,
          ),
        )
        .toBe(60);

      await page.goto(answerLink);
      await expect(page.getByText("answer changed meanwhile")).toBeVisible();
      await expect(
        panel.getByText("Answer changed after your grade"),
      ).toBeVisible();
    });
  }
});
