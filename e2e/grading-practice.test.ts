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

/** A practice test: Ann handed in (graded before it became practice), Ben is still writing, Cy has not started. */
async function seedPracticeTest() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId, {
      title: "[practice] Test",
      isPractice: true,
    });
    const questionId = await insertQuestion(db, testId, {
      title: "[practice] Question",
    });
    const ids: Record<string, string> = {};
    for (const name of ["Ann Handed", "Ben Writing", "Cy Absent"]) {
      const studentId = await insertStudent(db, { name });
      ids[name] = studentId;
      await enroll(db, { courseId, studentId });
    }
    for (const name of ["Ann Handed", "Ben Writing"]) {
      await insertAnswer(db, {
        testId,
        questionId,
        studentId: ids[name] as string,
        answer: { type: "free_text", text: `${name}'s answer` },
      });
    }
    await insertSubmission(db, {
      testId,
      studentId: ids["Ann Handed"] as string,
    });
    await insertGrade(db, {
      testId,
      questionId,
      studentId: ids["Ann Handed"] as string,
      feedback: "Teacher note from before",
    });
    return {
      courseId,
      testId,
      questionId,
      ann: ids["Ann Handed"] as string,
      ben: ids["Ben Writing"] as string,
    };
  });
}

test.describe("A practice test's grading screen shows answers only", () => {
  for (const route of routes) {
    test(`on ${route.name} By student shows the chip, answers and the picker with no grading controls`, async ({
      page,
    }) => {
      const ids = await seedPracticeTest();

      await page.goto(route.path(ids));

      await expect(page.getByText("Ann Handed's answer")).toBeVisible();
      const bar = page.getByTestId("grading-top-bar");
      await expect(
        bar.getByText("Practice · no grades released"),
      ).toBeVisible();
      await expect(bar.getByText("1 of 1 submitted")).toBeVisible();
      await expect(bar.getByText(/fully graded/)).toHaveCount(0);
      await expect(bar.getByText(/^Release/)).toHaveCount(0);
      await expect(page.getByTestId("grade-card")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^More/ })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /Save & next/ }),
      ).toHaveCount(0);
      await expect(page.getByText("Teacher note from before")).toHaveCount(0);
      await expect(page.getByText(/Needs grading only/)).toHaveCount(0);
      await expect(page.getByTestId("question-row-legend")).toHaveText(
        "Answered 1 · Blank 0",
      );

      const picker = page.getByRole("button", { name: "Student picker" });
      await hydrated(picker);
      await picker.click();
      const menu = page.getByRole("menu");
      await expect(menu.getByText("Submitted · 1")).toBeVisible();
      await expect(menu.getByText("Still writing · 1")).toBeVisible();
      await expect(menu.getByText("Not started · 1")).toBeVisible();
      await expect(menu.getByText(/Next waiting student/)).toHaveCount(0);

      // A student still writing opens without an "are you sure" dialog
      await menu.getByRole("menuitem", { name: /Ben Writing/ }).click();
      await expect(page.getByText("Ben Writing's answer")).toBeVisible();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(page.getByTestId("grade-card")).toHaveCount(0);
    });

    test(`on ${route.name} By question shows answers with no grading controls`, async ({
      page,
    }) => {
      const ids = await seedPracticeTest();

      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}`,
      );

      await expect(page.getByText("Ann Handed's answer")).toBeVisible();
      await expect(
        page
          .getByTestId("grading-top-bar")
          .getByText("Practice · no grades released"),
      ).toBeVisible();
      await expect(page.getByTestId("grade-card")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^More/ })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /Save & next/ }),
      ).toHaveCount(0);
      await expect(page.getByText("Teacher note from before")).toHaveCount(0);
      await expect(page.getByText(/Needs grading only/)).toHaveCount(0);
      await expect(page.getByTestId("question-row-legend")).toHaveText(
        "Answered 1 · Still writing 1 · Blank 0",
      );

      // A student still writing opens from her box without a confirm dialog
      await page
        .getByRole("link", { name: /Ben Writing still writing/ })
        .click();
      await expect(page.getByText("Ben Writing's answer")).toBeVisible();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });
  }
});
