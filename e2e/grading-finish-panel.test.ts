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
  insertTestStart,
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

async function seedFinishedTest() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId, {
      title: "[finish] Oct test",
      showGradeAfterSubmit: false,
      showCorrectAnswerAfterSubmit: false,
    });
    const q1 = await insertQuestion(db, testId, { title: "[finish] One" });
    const ann = await insertStudent(db, { name: "Ann Finish" });
    const bob = await insertStudent(db, { name: "Bob Finish" });
    const cy = await insertStudent(db, { name: "Cy Finish" });
    const di = await insertStudent(db, { name: "Di Finish" });
    for (const [studentId, submittedAt] of [
      [ann, new Date("2026-11-01T08:00:00Z")],
      [bob, new Date("2026-11-01T09:00:00Z")],
    ] as const) {
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId: q1,
        studentId,
        answer: { type: "free_text", text: `answer of ${studentId}` },
      });
      await insertSubmission(db, { testId, studentId, submittedAt });
    }
    await enroll(db, { courseId, studentId: cy });
    await insertAnswer(db, {
      testId,
      questionId: q1,
      studentId: cy,
      answer: { type: "free_text", text: "half way" },
    });
    await insertTestStart(db, {
      testId,
      studentId: cy,
      startedAt: new Date(),
    });
    await enroll(db, { courseId, studentId: di });
    return { courseId, testId, q1, ann, bob };
  });
}

test.describe("Finish panel", () => {
  for (const route of routes) {
    test(`on ${route.name} replaces the grade panel after the last answer is graded and says who is graded, released, still writing or not started`, async ({
      page,
    }) => {
      const ids = await seedFinishedTest();

      await page.goto(
        `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.q1}`,
      );
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("70");
      await save.click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.bob}`));

      const last = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(last);
      await panel.getByLabel("Score (0–100):").fill("80");
      await last.click();

      // The panel names the test and who is done
      const heading = page.getByRole("heading", {
        name: "Grading done · [finish] Oct test",
      });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
      await expect(page.getByTestId("grade-card")).toHaveCount(0);
      const finish = page.getByTestId("finish-panel");
      await expect(finish).toContainText("All 2 submitted students graded");
      await expect(finish).toContainText("Ann Finish");
      await expect(finish).toContainText("Bob Finish");
      await expect(finish).toContainText(
        "Grades not released yet · Ann Finish and Bob Finish can't see their grades until you release them.",
      );
      await expect(finish).toContainText(
        "Cy Finish is still writing. Di Finish hasn't started.",
      );
      await expect(
        finish.getByRole("link", { name: "Back to test" }),
      ).toHaveAttribute(
        "href",
        `/admin/courses/${ids.courseId}/tests/${ids.testId}`,
      );

      // The left pane keeps the last answer with the grade just saved
      await expect(page.getByTestId("grading-answer-scroll")).toContainText(
        "Your grade: 80 · saved just now",
      );

      // Opening a question box goes back to the grade panel
      await page.getByRole("link", { name: /^Q1\b/ }).first().click();
      await expect(page.getByTestId("grade-card")).toBeVisible();
      await expect(page.getByTestId("finish-panel")).toHaveCount(0);
    });
  }

  for (const route of routes) {
    test(`on ${route.name} By question ends on the panel after the last answer, and a kept done link opens the grade panel again while an answer waits`, async ({
      page,
    }) => {
      const ids = await seedFinishedTest();

      await page.goto(
        `${route.path(ids)}?mode=question&studentId=${ids.ann}&questionId=${ids.q1}`,
      );
      const panel = page.getByTestId("grade-card");
      for (const score of ["70", "80"]) {
        const save = panel.getByRole("button", { name: /^Save & next/ });
        await hydrated(save);
        await panel.getByLabel("Score (0–100):").fill(score);
        await save.click();
        await expect
          .poll(() =>
            withDb((db) =>
              db.collection("grade").countDocuments({ testId: ids.testId }),
            ),
          )
          .toBe(score === "70" ? 1 : 2);
        if (score === "70") {
          await expect(page).toHaveURL(new RegExp(`studentId=${ids.bob}`));
        }
      }
      await expect(
        page.getByRole("heading", { name: "Grading done · [finish] Oct test" }),
      ).toBeFocused();
      await expect(page.getByTestId("grade-card")).toHaveCount(0);

      // A new hand-in makes the kept link stale
      await withDb(async (db) => {
        const studentId = await insertStudent(db, { name: "Eve Finish" });
        await enroll(db, { courseId: ids.courseId, studentId });
        await insertAnswer(db, {
          testId: ids.testId,
          questionId: ids.q1,
          studentId,
          answer: { type: "free_text", text: "late answer" },
        });
        await insertSubmission(db, { testId: ids.testId, studentId });
      });
      await page.reload();
      await expect(page.getByTestId("grade-card")).toBeVisible();
      await expect(page.getByTestId("finish-panel")).toHaveCount(0);
    });
  }

  for (const route of routes) {
    test(`on ${route.name} the pinned button offers Release… while grades are hidden, then Release correct answers, then nothing`, async ({
      page,
    }) => {
      const ids = await seedFinishedTest();
      await withDb(async (db) => {
        for (const studentId of [ids.ann, ids.bob]) {
          await insertGrade(db, {
            testId: ids.testId,
            questionId: ids.q1,
            studentId,
            score: 90,
          });
        }
      });

      await page.goto(
        `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.q1}&done=1`,
      );
      const pinned = page.getByTestId("finish-release");
      await expect(pinned).toContainText(
        "2 graded students can't see their grades",
      );
      const release = pinned.getByRole("button", { name: "Release…" });
      await hydrated(release);
      await release.click();
      const dialog = page.getByRole("dialog", {
        name: "Release grades · [finish] Oct test",
      });
      await dialog
        .getByRole("button", { name: "Release", exact: true })
        .click();

      // Grades are out, the correct answers are still hidden
      const answers = pinned.getByRole("button", {
        name: "Release correct answers",
      });
      await expect(pinned).toContainText("Correct answers are still hidden");
      await hydrated(answers);
      await answers.click();

      await expect(pinned).toHaveCount(0);
      const released = await withDb((db) =>
        db.collection("test").findOne({ id: ids.testId }),
      );
      expect(released?.correctAnswersReleasedAt).toBeTruthy();
    });
  }
});
