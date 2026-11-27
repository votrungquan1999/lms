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
    await expect(
      panel.getByRole("heading", { name: "Grade · Q1 · Panel Student" }),
    ).toBeVisible();
    await expect(
      panel.getByText("[panel] Question · @panel-student"),
    ).toBeVisible();

    const fifty = panel.getByRole("button", { name: "50", exact: true });
    await hydrated(fifty);
    await fifty.click();
    await expect(panel.getByLabel("Score (0–100):")).toHaveValue("50");
    await panel.getByLabel("Feedback:", { exact: true }).fill("Good start");
    await panel.getByLabel(/Correct Solution/).fill("the fixed answer");
    await panel.getByRole("button", { name: /^Save & next/ }).click();
    await expect(
      page.getByRole("link", { name: /^Q\d+ graded$/ }).first(),
    ).toBeVisible({ timeout: 10000 });

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

test.describe("Overall feedback in the grade panel", () => {
  test("the teacher writes the student's overall feedback, changes it, then clears it", async ({
    page,
  }) => {
    const { testId, studentId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const questionId = await insertQuestion(db, testId);
      const studentId = await insertStudent(db, { name: "Feedback Student" });
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "an answer" },
      });
      await insertSubmission(db, { testId, studentId });
      return { testId, studentId };
    });
    const storedFeedback = () =>
      withDb(async (db) => {
        const row = await db
          .collection("test_feedback")
          .findOne({ testId, studentId });
        return row?.feedback ?? null;
      });

    await page.goto(`/admin/grading/${testId}?studentId=${studentId}`);
    await page.getByText("Overall feedback for Feedback Student").click();
    const field = page.getByLabel("Overall Test Feedback:");
    const save = page.getByRole("button", {
      name: /Save Feedback|Update Feedback/,
    });
    await hydrated(save);

    // Saves the text and waits until the form settles on it; the form resets to the saved text when the save ends, so typing earlier is overwritten.
    const saveFeedback = async (
      text: string,
      stored: string | null,
      buttonAfterSave: string,
    ) => {
      await field.fill(text);
      await save.click();
      await expect.poll(storedFeedback).toBe(stored);
      // The button reads "Saving..." from the click until the save ends.
      await expect(
        page.getByRole("button", { name: buttonAfterSave, exact: true }),
      ).toBeEnabled();
      await expect(field).toHaveValue(text);
    };

    // When: she writes feedback and saves
    await saveFeedback("Well done", "Well done", "Update Feedback");
    await expect(page.getByText("Feedback saved")).toBeVisible();

    // When: she changes it
    await saveFeedback("Even better", "Even better", "Update Feedback");

    // When: she empties it and saves, the feedback is removed
    await saveFeedback("", null, "Save Feedback");
  });
});
