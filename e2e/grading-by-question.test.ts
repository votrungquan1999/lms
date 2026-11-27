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

    test(`on ${route.name} switching between By question and By student keeps the student on screen`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const q1 = await insertQuestion(db, testId, {
          title: "[by-question] Pivot Q1",
          order: 1,
        });
        const q2 = await insertQuestion(db, testId, {
          title: "[by-question] Pivot Q2",
          order: 2,
        });
        // Ada handed in first and still needs Q2; her Q1 is graded, so Q1's box that needs a grade is Ben's.
        const ada = await insertStudent(db, { name: "Ada Pivot" });
        const ben = await insertStudent(db, { name: "Ben Pivot" });
        for (const [studentId, at, questionIds] of [
          [ada, new Date("2026-01-01T10:00:00Z"), [q1, q2]],
          [ben, new Date("2026-01-01T11:00:00Z"), [q1]],
        ] as const) {
          await enroll(db, { courseId, studentId });
          for (const questionId of questionIds) {
            await insertAnswer(db, {
              testId,
              questionId,
              studentId,
              answer: { type: "free_text", text: "an answer" },
              submittedAt: at,
            });
          }
          await insertSubmission(db, { testId, studentId, submittedAt: at });
        }
        await insertGrade(db, { testId, questionId: q1, studentId: ada });
        return { courseId, testId, q1, q2, ben };
      });

      // A bare By question open shows Ben, the first who needs Q1.
      await page.goto(`${route.path(ids)}?mode=question&questionId=${ids.q1}`);
      await expect(page.getByTestId("grade-card")).toContainText("Ben Pivot");
      await page.getByRole("tab", { name: "By student" }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.ben}`));
      await expect(page).toHaveURL(new RegExp(`questionId=${ids.q1}`));

      // Back to By question keeps Ben and the question.
      await page.getByRole("tab", { name: "By question" }).click();
      await expect(page).toHaveURL(/mode=question/);
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.ben}`));
      await expect(page).toHaveURL(new RegExp(`questionId=${ids.q1}`));
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

    test(`on ${route.name} Save & next saves the grade and moves to the next student on the question`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[by-question] Save question",
        });
        const students: string[] = [];
        for (const name of ["Ann Saver", "Bob Saver"]) {
          const studentId = await insertStudent(db, { name });
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: `${name} answer` },
          });
          await insertSubmission(db, { testId, studentId });
          students.push(studentId);
        }
        return { courseId, testId, questionId, students };
      });
      const [first, second] = ids.students as [string, string];

      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}&studentId=${first}`,
      );
      const panel = page.getByTestId("grade-card");
      await expect(panel).toContainText("Q1");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("64");
      await save.click();

      // The grade is in the database and the next student's answer is open.
      await expect
        .poll(async () =>
          withDb(
            async (db) =>
              (
                await db.collection("grade").findOne({
                  testId: ids.testId,
                  questionId: ids.questionId,
                  studentId: first,
                })
              )?.score,
          ),
        )
        .toBe(64);
      await expect(page).toHaveURL(new RegExp(`studentId=${second}`));
      await expect(page.getByTestId("grade-card")).toContainText("Q1");
      expect(new URL(page.url()).pathname).toBe(route.path(ids));
    });

    test(`on ${route.name} a typed grade asks before moving to another student and is not carried to her`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[by-question] Discard question",
        });
        const students: string[] = [];
        for (const name of ["Cat Discard", "Dan Discard"]) {
          const studentId = await insertStudent(db, { name });
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: `${name} answer` },
          });
          await insertSubmission(db, { testId, studentId });
          students.push(studentId);
        }
        return { courseId, testId, questionId, students };
      });
      const [first, second] = ids.students as [string, string];

      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}&studentId=${first}`,
      );
      const panel = page.getByTestId("grade-card");
      await hydrated(panel.getByRole("button", { name: /^Save & next/ }));
      await panel.getByLabel("Score (0–100):").fill("55");

      // Pressing her box asks first; Leave opens her with an empty form.
      await page
        .getByRole("link", { name: "Dan Discard needs grading" })
        .click();
      const dialog = page.getByRole("alertdialog", {
        name: "Discard your unsaved grade?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Leave" }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${second}`));
      await expect(
        page.getByTestId("grade-card").getByLabel("Score (0–100):"),
      ).toHaveValue("");
    });

    test(`on ${route.name} the answer scrolls on its own and the save button stays in view`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[by-question] Long answer question",
        });
        const studentId = await insertStudent(db, { name: "Long Answer" });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: {
            type: "free_text",
            text: Array.from(
              { length: 120 },
              (_, i) => `line ${i + 1} of a long answer`,
            ).join("\n"),
          },
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId, questionId, studentId };
      });

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}&studentId=${ids.studentId}`,
      );
      const save = page
        .getByTestId("grade-card")
        .getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      const answerScroll = page.getByTestId("grading-answer-scroll");
      const pageScrolls = () =>
        page.evaluate(
          () =>
            document.documentElement.scrollHeight >
            document.documentElement.clientHeight,
        );

      // A long answer scrolls inside its pane, not the page.
      expect(await pageScrolls()).toBe(false);
      const before = await save.boundingBox();
      await answerScroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await answerScroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(
        0,
      );
      expect(await save.boundingBox()).toEqual(before);
    });

    test(`on ${route.name} Regenerate on a student's answer previews the new suggestion without changing the grade`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[by-question] Regen question",
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
        return { courseId, testId, questionId, studentId };
      });

      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}&studentId=${ids.studentId}`,
      );
      const trigger = page.getByRole("button", {
        name: "Regenerate this answer",
      });
      await hydrated(trigger);
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/Reason/).fill("Too harsh on the loop.");
      await dialog
        .getByRole("button", { name: "Regenerate this answer" })
        .click();

      const panel = page.getByTestId("ai-suggestion-panel");
      await expect(panel.getByText("New AI suggestion")).toBeVisible({
        timeout: 15000,
      });
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
