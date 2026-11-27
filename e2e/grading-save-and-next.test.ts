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

test.describe("Save & next", () => {
  for (const route of routes) {
    test(`on ${route.name} saves the grade, moves through the student's answers, then crosses to the next waiting student`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const q1 = await insertQuestion(db, testId, { title: "[next] One" });
        const q2 = await insertQuestion(db, testId, {
          title: "[next] Two",
          order: 2,
        });
        const ann = await insertStudent(db, { name: "Ann Next" });
        const bob = await insertStudent(db, { name: "Bob Next" });
        for (const [studentId, submittedAt] of [
          [ann, new Date("2026-11-01T08:00:00Z")],
          [bob, new Date("2026-11-01T09:00:00Z")],
        ] as const) {
          await enroll(db, { courseId, studentId });
          for (const questionId of [q1, q2]) {
            await insertAnswer(db, {
              testId,
              questionId,
              studentId,
              answer: { type: "free_text", text: `answer of ${studentId}` },
            });
          }
          await insertSubmission(db, { testId, studentId, submittedAt });
        }
        return { courseId, testId, q1, q2, ann, bob };
      });

      await page.goto(
        `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.q1}&needsOnly=1`,
      );
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await expect(save).toHaveText("Save & next: Q2 ›");

      // Within Ann: Q1 moves to Q2
      await panel.getByLabel("Score (0–100):").fill("70");
      await save.click();
      await expect(page).toHaveURL(new RegExp(`questionId=${ids.q2}`));
      await expect(panel.getByRole("heading")).toContainText("Q2 · Ann Next");
      // It stays on the route it started on, with Needs grading only still on
      const afterSave = new URL(page.url());
      expect(afterSave.pathname).toBe(route.path(ids));
      expect(afterSave.searchParams.get("needsOnly")).toBe("1");

      // Her last answer: crosses to Bob's first answer
      const last = panel.getByRole("button", { name: "Save & next student" });
      await hydrated(last);
      await panel.getByLabel("Score (0–100):").fill("80");
      await last.click();
      await expect(page).toHaveURL(
        new RegExp(`studentId=${ids.bob}.*questionId=${ids.q1}`),
      );
      await expect(panel.getByRole("heading")).toContainText("Q1 · Bob Next");
      const afterCrossing = new URL(page.url());
      expect(afterCrossing.pathname).toBe(route.path(ids));
      expect(afterCrossing.searchParams.get("needsOnly")).toBe("1");

      // Both grades were saved by the two clicks
      const grades = await withDb((db) =>
        db
          .collection("grade")
          .find({ testId: ids.testId, studentId: ids.ann })
          .toArray(),
      );
      expect(grades.map((g) => g.score).sort()).toEqual([70, 80]);
    });
  }

  for (const route of routes) {
    test(`on ${route.name} a Save & next that cannot save says why next to the button and keeps the typed grade`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[next] Refused",
        });
        const ann = await insertStudent(db, { name: "Ann Refused" });
        await enroll(db, { courseId, studentId: ann });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId: ann,
          answer: { type: "free_text", text: "answer of Ann" },
        });
        await insertSubmission(db, { testId, studentId: ann });
        return { courseId, testId, questionId, ann };
      });

      await page.goto(
        `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.questionId}`,
      );
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("70");
      await panel
        .getByLabel("Feedback:", { exact: true })
        .fill("typed feedback");
      // Ann leaves the course while the teacher is grading her.
      await withDb((db) =>
        db
          .collection("enrollment")
          .deleteMany({ courseId: ids.courseId, studentId: ids.ann }),
      );

      await save.click();

      await expect(panel.getByRole("alert")).toHaveText("Student not found");
      await expect(page).toHaveURL(new RegExp(`questionId=${ids.questionId}`));
      await expect(panel.getByLabel("Score (0–100):")).toHaveValue("70");
      await expect(panel.getByLabel("Feedback:", { exact: true })).toHaveValue(
        "typed feedback",
      );
      await expect(save).toBeEnabled();
      const grade = await withDb((db) =>
        db.collection("grade").findOne({ testId: ids.testId }),
      );
      expect(grade).toBeNull();
    });
  }

  for (const route of routes) {
    test(`on ${route.name} a retried Save & next that works clears the reason it failed before`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const written = await insertQuestion(db, testId, {
          title: "[next] Written",
        });
        // A choice answer with no automatic mark keeps her waiting, so Save & next stays on this answer.
        const optionId = crypto.randomUUID();
        const choice = await insertQuestion(db, testId, {
          title: "[next] Choice",
          order: 2,
          type: "single_select",
          options: [
            { id: optionId, text: "Right", isCorrect: true },
            { id: crypto.randomUUID(), text: "Wrong", isCorrect: false },
          ],
        });
        const ann = await insertStudent(db, { name: "Ann Retry" });
        const enrollmentId = await enroll(db, { courseId, studentId: ann });
        await insertAnswer(db, {
          testId,
          questionId: written,
          studentId: ann,
          answer: { type: "free_text", text: "answer of Ann" },
        });
        await insertAnswer(db, {
          testId,
          questionId: choice,
          studentId: ann,
          answer: { type: "mc", selectedIds: [optionId] },
        });
        await insertSubmission(db, { testId, studentId: ann });
        return { courseId, testId, written, ann, enrollmentId };
      });

      await page.goto(
        `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.written}`,
      );
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("70");
      // Ann leaves the course while the teacher is grading her.
      await withDb((db) =>
        db
          .collection("enrollment")
          .updateOne({ id: ids.enrollmentId }, { $set: { studentId: "left" } }),
      );
      await save.click();
      await expect(panel.getByRole("alert")).toHaveText("Student not found");

      // She is enrolled again, so the same click now saves.
      await withDb((db) =>
        db
          .collection("enrollment")
          .updateOne(
            { id: ids.enrollmentId },
            { $set: { studentId: ids.ann } },
          ),
      );
      await save.click();

      await expect
        .poll(() =>
          withDb((db) =>
            db.collection("grade").findOne({ testId: ids.testId }),
          ),
        )
        .not.toBeNull();
      await expect(panel.getByRole("alert")).toHaveCount(0);
    });
  }

  for (const route of routes) {
    for (const mode of ["student", "question"]) {
      test(`on ${route.name} By ${mode}, Save & next asks before dropping an unsaved overall feedback draft`, async ({
        page,
      }) => {
        const ids = await withDb(async (db) => {
          const courseId = await insertCourse(db);
          const testId = await insertTest(db, courseId);
          const questionId = await insertQuestion(db, testId, {
            title: "[next] Overall draft",
          });
          const ann = await insertStudent(db, { name: "Ann Draft" });
          const bob = await insertStudent(db, { name: "Bob Draft" });
          for (const [studentId, submittedAt] of [
            [ann, new Date("2026-11-01T08:00:00Z")],
            [bob, new Date("2026-11-01T09:00:00Z")],
          ] as const) {
            await enroll(db, { courseId, studentId });
            await insertAnswer(db, {
              testId,
              questionId,
              studentId,
              answer: { type: "free_text", text: `answer of ${studentId}` },
            });
            await insertSubmission(db, { testId, studentId, submittedAt });
          }
          return { courseId, testId, questionId, ann, bob };
        });
        const savedGrade = () =>
          withDb(
            async (db) =>
              (
                await db.collection("grade").findOne({
                  testId: ids.testId,
                  questionId: ids.questionId,
                  studentId: ids.ann,
                })
              )?.score ?? null,
          );

        await page.goto(
          `${route.path(ids)}?mode=${mode}&studentId=${ids.ann}&questionId=${ids.questionId}`,
        );
        const panel = page.getByTestId("grade-card");
        const save = panel.getByRole("button", { name: /^Save & next/ });
        await hydrated(save);
        await panel.getByLabel("Score (0–100):").fill("70");
        await page.getByText("Overall feedback for Ann Draft").click();
        await page.getByLabel("Overall Test Feedback:").fill("a draft for Ann");
        await save.click();

        // Stay keeps everything and saves nothing.
        const dialog = page.getByRole("alertdialog", {
          name: "Discard your unsaved grade?",
        });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Stay" }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(new RegExp(`studentId=${ids.ann}`));
        await expect(panel.getByLabel("Score (0–100):")).toHaveValue("70");
        await expect(page.getByLabel("Overall Test Feedback:")).toHaveValue(
          "a draft for Ann",
        );
        expect(await savedGrade()).toBeNull();

        // Leave saves the grade and moves on.
        await save.click();
        await dialog.getByRole("button", { name: "Leave" }).click();
        await expect.poll(savedGrade).toBe(70);
        await expect(page).toHaveURL(new RegExp(`studentId=${ids.bob}`));
      });
    }
  }
});
