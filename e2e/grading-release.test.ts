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

test.describe("Releasing a test from the grading screen", () => {
  for (const route of routes) {
    test(`on ${route.name} a dialog on a short screen stays inside it and scrolls`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId, {
          title: "[release-short] Test",
          showGradeAfterSubmit: false,
          showCorrectAnswerAfterSubmit: false,
        });
        const questionId = await insertQuestion(db, testId, {
          title: "[release-short] Question",
        });
        const studentId = await insertStudent(db);
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "an answer" },
        });
        await insertSubmission(db, { testId, studentId });
        await insertGrade(db, { testId, questionId, studentId });
        return { courseId, testId };
      });
      await page.setViewportSize({ width: 1280, height: 260 });

      await page.goto(route.path(ids));
      const trigger = page.getByRole("button", { name: /^Release .+▾$/ });
      await hydrated(trigger);
      await trigger.click();
      await page.getByRole("menuitem", { name: /Release grades…/ }).click();
      const dialog = page.getByRole("dialog", {
        name: "Release grades · [release-short] Test",
      });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(260);
      // What does not fit scrolls inside the dialog
      expect(
        await dialog.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
    });

    test(`on ${route.name} the release dialog releases grades and correct answers in one click`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId, {
          title: "[release] Test",
          showGradeAfterSubmit: false,
          showCorrectAnswerAfterSubmit: false,
        });
        const questionId = await insertQuestion(db, testId, {
          title: "[release] Question",
        });
        const studentId = await insertStudent(db);
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "an answer" },
        });
        await insertSubmission(db, { testId, studentId });
        await insertGrade(db, { testId, questionId, studentId });
        return { courseId, testId };
      });

      await page.goto(route.path(ids));
      await expect(page.getByTestId("release-state")).toHaveText(
        "Not released",
      );

      const trigger = page.getByRole("button", { name: /^Release .+▾$/ });
      await hydrated(trigger);
      await trigger.click();
      await page.getByRole("menuitem", { name: /Release grades…/ }).click();
      const dialog = page.getByRole("dialog", {
        name: "Release grades · [release] Test",
      });
      await dialog
        .getByRole("checkbox", { name: /Also show correct answers/ })
        .click();
      await dialog.getByRole("button", { name: "Release" }).click();

      // Both release times are stamped; the chip and the menu follow.
      await expect(page.getByTestId("release-state")).toHaveText("Released");
      await expect(
        page.getByRole("button", { name: /^Release .+▾$/ }),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          withDb(async (db) => {
            const test = await db
              .collection("test")
              .findOne({ id: ids.testId });
            return [
              test?.gradesReleasedAt instanceof Date,
              test?.correctAnswersReleasedAt instanceof Date,
            ];
          }),
        )
        .toEqual([true, true]);
    });
  }
});

test.describe("The release dialog's list of chosen students", () => {
  for (const route of routes) {
    test(`on ${route.name} lists the students in the order the Tests tab entry lists them`, async ({
      page,
    }) => {
      // Given a test with a graded student, one still writing and one not started, whose names sort the other way round
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId, {
          title: "[order] Test",
          showGradeAfterSubmit: false,
        });
        const questionId = await insertQuestion(db, testId, {
          title: "[order] Question",
        });
        const graded = await insertStudent(db, { name: "Gina Order" });
        const writing = await insertStudent(db, { name: "Zoe Order" });
        const idle = await insertStudent(db, { name: "Aaron Order" });
        for (const studentId of [graded, writing, idle]) {
          await enroll(db, { courseId, studentId });
        }
        for (const studentId of [graded, writing]) {
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "an answer" },
          });
        }
        await insertSubmission(db, { testId, studentId: graded });
        await insertGrade(db, { testId, questionId, studentId: graded });
        return { courseId, testId };
      });

      /** The students the dialog's "Only chosen students" list shows, top to bottom. */
      const chosenList = async (dialog: ReturnType<typeof page.getByRole>) => {
        await dialog
          .getByRole("radio", { name: /Only chosen students/ })
          .click();
        const labels = await dialog
          .getByTestId("release-checklist")
          .locator("label")
          .allTextContents();
        return labels.map((label) => label.split("@")[0].trim());
      };

      // When the teacher opens the dialog from the course's Tests tab
      await page.goto(`/admin/courses/${ids.courseId}`);
      const release = page
        .getByTestId(`test-row-${ids.testId}`)
        .getByRole("button", { name: "Release", exact: true })
        .first();
      await hydrated(release);
      await release.click();
      const fromTab = await chosenList(
        page.getByRole("dialog", { name: "Release grades · [order] Test" }),
      );

      // And from the grading screen
      await page.goto(route.path(ids));
      const trigger = page.getByRole("button", { name: /^Release .+▾$/ });
      await hydrated(trigger);
      await trigger.click();
      await page.getByRole("menuitem", { name: /Release grades…/ }).click();
      const fromScreen = await chosenList(
        page.getByRole("dialog", { name: "Release grades · [order] Test" }),
      );

      // Then both list graded students first, then the one still writing, then the one not started
      const expected = ["Gina Order", "Zoe Order", "Aaron Order"];
      expect(fromScreen).toEqual(expected);
      expect(fromTab).toEqual(expected);
    });
  }
});
