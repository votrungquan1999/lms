import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  expectNoPageOverflow,
  expectWrapped,
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
      const save = panel.getByRole("button", { name: /^Save & next/ });
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
      for (const [index, name] of ["Ann Discard", "Ben Discard"].entries()) {
        const studentId = await insertStudent(db, { name });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: `${name} answer` },
        });
        await insertSubmission(db, {
          testId,
          studentId,
          submittedAt: new Date(Date.UTC(2026, 10, 1, 8, index)),
        });
        studentIds.push(studentId);
      }
      return { courseId, testId, questionId, studentIds };
    });
  }

  for (const route of routes) {
    test(`on ${route.name} a typed score asks before the back link leaves; Stay keeps it, Leave drops it`, async ({
      page,
    }) => {
      const { courseId, testId, questionId, studentIds } =
        await seedTwoStudents();
      const [studentId] = studentIds;

      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}&questionId=${questionId}`,
      );
      const panel = page.getByTestId("grade-card");
      await hydrated(panel.getByRole("button", { name: /^Save & next/ }));
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
      await expect(page).toHaveURL(
        `/admin/courses/${courseId}/tests/${testId}`,
      );
      const grade = await withDb((db) =>
        db.collection("grade").findOne({ testId, questionId }),
      );
      expect(grade).toBeNull();
    });
  }

  for (const route of routes) {
    test(`on ${route.name} a saved grade is not unsaved work, so leaving afterwards asks nothing`, async ({
      page,
    }) => {
      const { courseId, testId, questionId, studentIds } =
        await seedTwoStudents();
      const [studentId] = studentIds;

      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}&questionId=${questionId}`,
      );
      const panel = page.getByTestId("grade-card");
      const save = panel.getByRole("button", { name: /^Save & next/ });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("70");
      await save.click();
      // The other student waits, so Save & next leaves this one; the saved grade is in the database.
      await expect
        .poll(() =>
          withDb((db) =>
            db.collection("grade").countDocuments({ testId, questionId }),
          ),
        )
        .toBe(1);
      await expect(page).not.toHaveURL(new RegExp(`studentId=${studentId}`));

      await page.getByRole("link", { name: "[discard] Test" }).click();

      await expect(page).toHaveURL(
        `/admin/courses/${courseId}/tests/${testId}`,
      );
    });
  }

  for (const route of routes) {
    test(`on ${route.name} overall feedback typed for one student is dropped, not carried, when she moves to another student`, async ({
      page,
    }) => {
      const { courseId, testId, questionId, studentIds } =
        await seedTwoStudents();
      const [studentId] = studentIds;

      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}&questionId=${questionId}`,
      );
      await hydrated(
        page
          .getByTestId("grade-card")
          .getByRole("button", { name: /^Save & next/ }),
      );
      await page.getByText("Overall feedback for Ann Discard").click();
      await page.getByLabel("Overall Test Feedback:").fill("draft for Ann");

      // When: she steps to the other student and confirms leaving
      await page.getByRole("link", { name: "Next submitted student" }).click();
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
      await expect(page).toHaveURL(
        `/admin/courses/${courseId}/tests/${testId}`,
      );
    });
  }
});

test.describe("Question number row", () => {
  for (const route of routes) {
    test(`on ${route.name} a 60-question test wraps its boxes without sideways scroll, rings the current one and opens a question on click`, async ({
      page,
    }) => {
      const { courseId, testId, studentId, questionIds } = await withDb(
        async (db) => {
          const courseId = await insertCourse(db);
          const testId = await insertTest(db, courseId);
          const studentId = await insertStudent(db, { name: "Row Student" });
          await enroll(db, { courseId, studentId });
          const questionIds: string[] = [];
          for (let order = 1; order <= 60; order++) {
            const questionId = await insertQuestion(db, testId, {
              order,
              title: `[row] Question ${order}`,
            });
            questionIds.push(questionId);
            await insertAnswer(db, {
              testId,
              questionId,
              studentId,
              answer: { type: "free_text", text: `answer ${order}` },
            });
          }
          await insertSubmission(db, { testId, studentId });
          return { courseId, testId, studentId, questionIds };
        },
      );

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}&questionId=${questionIds[0]}`,
      );

      // Then: the 60 boxes wrap onto several lines and the page does not widen
      await expect(page.getByTestId("question-row-boxes")).toBeVisible();
      await expectWrapped(page.getByTestId("question-row-boxes"));
      await expectNoPageOverflow(page);
      await expect(
        page.getByRole("link", { name: "Q1 needs grading" }),
      ).toHaveAttribute("aria-current", "true");

      // When: the teacher clicks the box of question 42
      await page.getByRole("link", { name: "Q42 needs grading" }).click();

      // Then: that question opens and its box is the current one
      await expect(
        page
          .getByTestId("grade-card")
          .getByRole("heading", { name: "Grade · Q42 · Row Student" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Q42 needs grading" }),
      ).toHaveAttribute("aria-current", "true");
      await expect(
        page.getByRole("link", { name: "Q1 needs grading" }),
      ).not.toHaveAttribute("aria-current", "true");
    });
  }

  for (const route of routes) {
    test(`on ${route.name} a draft typed on one answer is asked about and never lands on the answer the next box opens`, async ({
      page,
    }) => {
      const { courseId, testId, studentId, questionIds } = await withDb(
        async (db) => {
          const courseId = await insertCourse(db);
          const testId = await insertTest(db, courseId);
          const studentId = await insertStudent(db, { name: "Draft Student" });
          await enroll(db, { courseId, studentId });
          const questionIds: string[] = [];
          for (const order of [1, 2]) {
            const questionId = await insertQuestion(db, testId, { order });
            questionIds.push(questionId);
            await insertAnswer(db, {
              testId,
              questionId,
              studentId,
              answer: { type: "free_text", text: `answer ${order}` },
            });
          }
          await insertSubmission(db, { testId, studentId });
          return { courseId, testId, studentId, questionIds };
        },
      );

      await page.goto(
        `${route.path({ courseId, testId })}?studentId=${studentId}&questionId=${questionIds[0]}`,
      );
      const panel = page.getByTestId("grade-card");
      await hydrated(panel.getByRole("button", { name: /^Save & next/ }));
      await panel.getByLabel("Score (0–100):").fill("70");
      await panel.getByLabel("Feedback:", { exact: true }).fill("draft one");

      // When: she clicks the second box
      await page.getByRole("link", { name: "Q2 needs grading" }).click();
      const dialog = page.getByRole("alertdialog", {
        name: "Discard your unsaved grade?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Leave" }).click();

      // Then: the second answer opens with an empty form
      await expect(
        panel.getByRole("heading", { name: "Grade · Q2 · Draft Student" }),
      ).toBeVisible();
      await expect(panel.getByLabel("Score (0–100):")).toHaveValue("");
      await expect(panel.getByLabel("Feedback:", { exact: true })).toHaveValue(
        "",
      );

      // And: going back to the first box asks nothing, as nothing is typed
      await page.getByRole("link", { name: "Q1 needs grading" }).click();
      await expect(
        panel.getByRole("heading", { name: "Grade · Q1 · Draft Student" }),
      ).toBeVisible();
    });
  }
});

test.describe("Needs grading only", () => {
  for (const route of ["To grade", "the test page"] as const) {
    test(`hides the boxes that need nothing and stays on while the teacher moves between answers, opened from ${route}`, async ({
      page,
    }) => {
      const { courseId, testId, studentId, questionIds } = await withDb(
        async (db) => {
          const courseId = await insertCourse(db);
          const testId = await insertTest(db, courseId);
          const studentId = await insertStudent(db, { name: "Needs Student" });
          await enroll(db, { courseId, studentId });
          const questionIds: string[] = [];
          for (const order of [1, 2, 3]) {
            const questionId = await insertQuestion(db, testId, {
              title: `[needs] Question ${order}`,
              order,
            });
            await insertAnswer(db, {
              testId,
              questionId,
              studentId,
              answer: { type: "free_text", text: `answer ${order}` },
            });
            questionIds.push(questionId);
          }
          // Q1 is graded; Q2 and Q3 wait for a grade.
          await insertGrade(db, {
            testId,
            questionId: questionIds[0],
            studentId,
            score: 80,
          });
          await insertSubmission(db, { testId, studentId });
          return { courseId, testId, studentId, questionIds };
        },
      );
      const basePath =
        route === "To grade"
          ? `/admin/grading/${testId}`
          : `/admin/courses/${courseId}/tests/${testId}/grading`;
      await page.goto(
        `${basePath}?studentId=${studentId}&questionId=${questionIds[1]}`,
      );
      const row = page.getByTestId("question-row-boxes");
      const toggle = page.getByRole("link", { name: "Needs grading only" });
      await hydrated(page.getByRole("button", { name: /^Save & next/ }));

      // Given: every box shows
      await expect(row.getByRole("link")).toHaveCount(3);
      await expect(toggle).toHaveAttribute("aria-pressed", "false");

      // When: the teacher turns Needs grading only on
      await toggle.click();

      // Then: the graded box is gone and the two waiting boxes stay
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(row.getByRole("link", { name: "Q1 graded" })).toHaveCount(0);
      await expect(row.getByRole("link")).toHaveCount(2);

      // When: the teacher opens the other waiting answer
      await row.getByRole("link", { name: "Q3 needs grading" }).click();

      // Then: the filter is still on
      await expect(page).toHaveURL(new RegExp(`questionId=${questionIds[2]}`));
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(row.getByRole("link")).toHaveCount(2);

      // When: the teacher turns it off
      await toggle.click();

      // Then: every box shows again
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(row.getByRole("link")).toHaveCount(3);
    });
  }

  test("keeps the current box when it needs nothing and says so when nothing needs grading", async ({
    page,
  }) => {
    const { testId, studentId, questionId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const studentId = await insertStudent(db, { name: "Done Student" });
      await enroll(db, { courseId, studentId });
      const questionId = await insertQuestion(db, testId, {
        title: "[needs] Only question",
      });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "answer" },
      });
      await insertGrade(db, { testId, questionId, studentId, score: 100 });
      await insertSubmission(db, { testId, studentId });
      return { testId, studentId, questionId };
    });
    await page.goto(
      `/admin/grading/${testId}?studentId=${studentId}&questionId=${questionId}&needsOnly=1`,
    );

    // Then: the open box stays and the row says nothing else needs grading
    await expect(
      page.getByTestId("question-row-boxes").getByRole("link"),
    ).toHaveCount(1);
    await expect(page.getByText("Nothing needs grading")).toBeVisible();
  });
});
