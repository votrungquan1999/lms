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

test.describe("Grading workspace", () => {
  for (const route of ["To grade", "the test page"] as const) {
    test(`the answer and the grade panel scroll on their own and the save button stays in view, opened from ${route}`, async ({
      page,
    }) => {
      const { courseId, testId, studentId, questionId } = await withDb(
        async (db) => {
          const courseId = await insertCourse(db);
          const testId = await insertTest(db, courseId);
          const questionId = await insertQuestion(db, testId, {
            title: "[workspace] Question",
          });
          const studentId = await insertStudent(db, {
            name: "Workspace Student",
          });
          await enroll(db, { courseId, studentId });
          const longAnswer = Array.from(
            { length: 120 },
            (_, i) => `line ${i + 1} of a long answer`,
          ).join("\n");
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: longAnswer },
          });
          await insertSubmission(db, { testId, studentId });
          return { courseId, testId, studentId, questionId };
        },
      );

      await page.setViewportSize({ width: 1440, height: 900 });
      const basePath =
        route === "To grade"
          ? `/admin/grading/${testId}`
          : `/admin/courses/${courseId}/tests/${testId}/grading`;
      await page.goto(
        `${basePath}?studentId=${studentId}&questionId=${questionId}`,
      );
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: "Save Grade" });
      await hydrated(save);
      const answerScroll = page.getByTestId("grading-answer-scroll");
      const pageScrolls = () =>
        page.evaluate(
          () =>
            document.documentElement.scrollHeight >
            document.documentElement.clientHeight,
        );
      const inViewport = async (locator: typeof save) => {
        const box = await locator.boundingBox();
        const height = page.viewportSize()?.height ?? 0;
        return box !== null && box.y >= 0 && box.y + box.height <= height;
      };

      // Given: a long answer on a 1440 x 900 screen
      // Then: the page itself does not scroll, but the answer does
      expect(await pageScrolls()).toBe(false);
      expect(
        await answerScroll.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);

      // When: the teacher scrolls the answer to its end
      const before = await save.boundingBox();
      await answerScroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await answerScroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(
        0,
      );

      // Then: the save button has not moved
      expect(await save.boundingBox()).toEqual(before);
      expect(await pageScrolls()).toBe(false);

      // When: the screen is too short to show the whole panel
      await page.setViewportSize({ width: 1440, height: 520 });

      // Then: the panel scrolls inside itself and the save button is still on screen
      const solution = panel.getByLabel(/Correct Solution/);
      expect(await inViewport(solution)).toBe(false);
      // A wheel, not scrollIntoView: scrollIntoView also scrolls a panel that hides its overflow.
      await panel.getByText("Score (0–100):").hover();
      await page.mouse.wheel(0, 2000);
      await expect.poll(() => inViewport(solution)).toBe(true);
      expect(await pageScrolls()).toBe(false);
      expect(await inViewport(save)).toBe(true);
    });
  }
});
