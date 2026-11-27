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

test.describe("Leaving a grade that was typed but not saved", () => {
  /** A one-question test with two students who handed in, "Ann" first in the submitted order. */
  async function seedTwoStudents() {
    return withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId, {
        title: "[discard] Test",
      });
      const questionId = await insertQuestion(db, testId, {
        title: "[discard] Question",
      });
      const studentIds: string[] = [];
      for (const name of ["Ann Discard", "Ben Discard"]) {
        const studentId = await insertStudent(db, { name });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: `${name} answer` },
        });
        await insertSubmission(db, { testId, studentId });
        studentIds.push(studentId);
      }
      return { courseId, testId, questionId, studentIds };
    });
  }

  test("a typed score asks before the back link leaves; Stay keeps it, Leave drops it", async ({
    page,
  }) => {
    const { courseId, testId, questionId, studentIds } =
      await seedTwoStudents();
    const [studentId] = studentIds;

    await page.goto(
      `/admin/grading/${testId}?studentId=${studentId}&questionId=${questionId}`,
    );
    const panel = page.getByTestId("grade-card");
    await hydrated(panel.getByRole("button", { name: "Save Grade" }));
    const score = panel.getByLabel("Score (0–100):");
    await score.fill("70");

    // When: she clicks the back link
    await page.getByRole("link", { name: "[discard] Test" }).click();

    // Then: she is asked first, and Stay keeps the typed score
    const dialog = page.getByRole("alertdialog", {
      name: "Discard your unsaved grade?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(dialog).toBeHidden();
    await expect(score).toHaveValue("70");

    // When: she asks again and leaves
    await page.getByRole("link", { name: "[discard] Test" }).click();
    await dialog.getByRole("button", { name: "Leave" }).click();

    // Then: the test page opens and nothing was saved
    await expect(page).toHaveURL(`/admin/courses/${courseId}/tests/${testId}`);
    const grade = await withDb((db) =>
      db.collection("grade").findOne({ testId, questionId }),
    );
    expect(grade).toBeNull();
  });

  test("a saved grade is not unsaved work, so leaving afterwards asks nothing", async ({
    page,
  }) => {
    const { courseId, testId, questionId, studentIds } =
      await seedTwoStudents();
    const [studentId] = studentIds;

    await page.goto(
      `/admin/grading/${testId}?studentId=${studentId}&questionId=${questionId}`,
    );
    const panel = page.getByTestId("grade-card");
    const save = panel.getByRole("button", { name: "Save Grade" });
    await hydrated(save);
    await panel.getByLabel("Score (0–100):").fill("70");
    await save.click();
    await expect(panel.getByText("Grade saved")).toBeVisible();

    await page.getByRole("link", { name: "[discard] Test" }).click();

    await expect(page).toHaveURL(`/admin/courses/${courseId}/tests/${testId}`);
  });

  test("overall feedback typed for one student is dropped, not carried, when she moves to another student", async ({
    page,
  }) => {
    const { courseId, testId, questionId, studentIds } =
      await seedTwoStudents();
    const [studentId] = studentIds;

    await page.goto(
      `/admin/grading/${testId}?studentId=${studentId}&questionId=${questionId}`,
    );
    await hydrated(
      page
        .getByTestId("grade-card")
        .getByRole("button", { name: "Save Grade" }),
    );
    await page.getByText("Overall feedback for Ann Discard").click();
    await page.getByLabel("Overall Test Feedback:").fill("draft for Ann");

    // When: she steps to the other student and confirms leaving
    await page
      .getByRole("link", { name: "Previous submitted student" })
      .click();
    const dialog = page.getByRole("alertdialog", {
      name: "Discard your unsaved grade?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Leave" }).click();

    // Then: the next student's overall feedback is empty and leaving asks nothing
    await expect(page.getByTestId("grade-card")).toContainText("Ben Discard");
    await page.getByText("Overall feedback for Ben Discard").click();
    await expect(page.getByLabel("Overall Test Feedback:")).toHaveValue("");
    await page.getByRole("link", { name: "[discard] Test" }).click();
    await expect(page).toHaveURL(`/admin/courses/${courseId}/tests/${testId}`);
  });
});
