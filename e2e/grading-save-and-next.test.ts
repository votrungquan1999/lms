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
});
