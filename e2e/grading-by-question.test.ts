import { expect, test } from "@playwright/test";
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

test.describe("Grading by question", () => {
  for (const route of routes) {
    test(`on ${route.name} the question picker and ‹ › move between questions, keeping Needs grading only`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionIds: string[] = [];
        for (const order of [1, 2, 3]) {
          questionIds.push(
            await insertQuestion(db, testId, {
              title: `[by-question] Question ${order}`,
              order,
            }),
          );
        }
        const studentId = await insertStudent(db);
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId: questionIds[0] as string,
          studentId,
          answer: { type: "free_text", text: "an answer" },
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId, questionIds };
      });

      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionIds[0]}&needsOnly=1`,
      );
      await expect(
        page.getByRole("button", { name: "Question picker" }),
      ).toContainText("Q1 [by-question] Question 1");

      // The picker opens another question and keeps the filter.
      await page.getByRole("button", { name: "Question picker" }).click();
      await page
        .getByRole("menuitem", { name: "Q2 [by-question] Question 2" })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`questionId=${ids.questionIds[1]}.*needsOnly=1`),
      );

      // › steps to the next question.
      await page.getByRole("link", { name: "Next question" }).click();
      await expect(page).toHaveURL(
        new RegExp(`questionId=${ids.questionIds[2]}`),
      );
      await expect(
        page.getByRole("button", { name: "Question picker" }),
      ).toContainText("Q3 [by-question] Question 3");
    });

    test(`on ${route.name} the row has a box per student, and a still-writing student opens only after Grade anyway`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[by-question] Row question",
        });
        const students: Record<string, string> = {};
        for (const [key, name, handedIn] of [
          ["waiting", "Wanda Waiting", true],
          ["writing", "Wren Writing", false],
        ] as const) {
          const studentId = await insertStudent(db, { name });
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: `${key} answer` },
          });
          if (handedIn) await insertSubmission(db, { testId, studentId });
          students[key] = studentId;
        }
        return { courseId, testId, questionId, students };
      });

      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}`,
      );
      const row = page.getByTestId("question-row");
      await expect(
        row.getByRole("link", { name: "Wanda Waiting needs grading" }),
      ).toHaveAttribute("aria-current", "true");

      await row
        .getByRole("button", { name: "Wren Writing still writing" })
        .click();
      await expect(page.getByRole("alertdialog")).toContainText(
        "Wren Writing is still writing. Grade anyway?",
      );
      await page.getByRole("button", { name: "Grade anyway" }).click();
      await expect(page).toHaveURL(
        new RegExp(`studentId=${ids.students.writing}`),
      );
    });
  }
});
