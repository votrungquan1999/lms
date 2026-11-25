import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
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
    await expect(page.getByText("In Progress").first()).toBeVisible();

    const gradeCard = page.getByTestId("grade-card");
    await gradeCard.getByLabel("Score (0–100):").fill("73");
    const save = gradeCard.getByRole("button", { name: "Save Grade" });
    await hydrated(save);
    await save.click();
    await page.getByRole("button", { name: "Submit Anyway" }).click();
    await expect(gradeCard.getByText("Grade saved")).toBeVisible({
      timeout: 10000,
    });

    await page.reload();
    await expect(
      page.getByTestId("grade-card").getByLabel("Score (0–100):"),
    ).toHaveValue("73");
  });
});
