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

test.describe("Grade panel", () => {
  test("a quick score, feedback and a correct solution save as the grade for the answer shown", async ({
    page,
  }) => {
    const { testId, studentId, questionId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const questionId = await insertQuestion(db, testId, {
        title: "[panel] Question",
      });
      const studentId = await insertStudent(db, {
        name: "Panel Student",
        username: "panel-student",
      });
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "my answer" },
      });
      await insertSubmission(db, { testId, studentId });
      return { testId, studentId, questionId };
    });

    await page.goto(
      `/admin/grading/${testId}?studentId=${studentId}&questionId=${questionId}`,
    );
    const panel = page.getByTestId("grade-card");
    await expect(panel.getByText("Panel Student")).toBeVisible();
    await expect(
      panel.getByText("[panel] Question · @panel-student"),
    ).toBeVisible();

    const fifty = panel.getByRole("button", { name: "50", exact: true });
    await hydrated(fifty);
    await fifty.click();
    await expect(panel.getByLabel("Score (0–100):")).toHaveValue("50");
    await panel.getByLabel("Feedback:").fill("Good start");
    await panel.getByLabel(/Correct Solution/).fill("the fixed answer");
    await panel.getByRole("button", { name: "Save Grade" }).click();
    await expect(panel.getByText("Grade saved")).toBeVisible({
      timeout: 10000,
    });

    const grade = await withDb((db) =>
      db.collection("grade").findOne({ testId, questionId, studentId }),
    );
    expect(grade).toMatchObject({
      score: 50,
      feedback: "Good start",
      solution: "the fixed answer",
    });
  });
});
