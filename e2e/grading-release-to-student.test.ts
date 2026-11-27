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

test.describe("Releasing one student's grade from More", () => {
  for (const route of routes) {
    test(`on ${route.name} More releases her grade alone and then reads Released to her`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId, {
          title: "[release-one] Test",
          showGradeAfterSubmit: false,
        });
        const questionId = await insertQuestion(db, testId, {
          title: "[release-one] Question",
        });
        const students: Record<string, string> = {};
        for (const name of ["Ravi Released", "Other Olga", "Quinn Question"]) {
          const studentId = await insertStudent(db, { name });
          students[name] = studentId;
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: `${name}'s answer` },
          });
          await insertSubmission(db, { testId, studentId });
          await insertGrade(db, { testId, questionId, studentId });
        }
        return {
          courseId,
          testId,
          questionId,
          ravi: students["Ravi Released"] as string,
          olga: students["Other Olga"] as string,
        };
      });

      await page.goto(`${route.path(ids)}?studentId=${ids.ravi}`);

      const more = page.getByRole("button", { name: /^More/ });
      await hydrated(more);
      await more.click();
      await page
        .getByRole("menuitem", { name: /Release to Ravi Released/ })
        .click();

      // Only her submission is stamped
      await expect
        .poll(() =>
          withDb(async (db) =>
            (
              await db
                .collection("test_submission")
                .find({ testId: ids.testId, releasedAt: { $ne: null } })
                .toArray()
            ).map((doc) => doc.studentId),
          ),
        )
        .toEqual([ids.ravi]);

      // Moving to another student without a reload must leave no release state behind; her release must still be on offer
      await page.getByRole("button", { name: "Student picker" }).click();
      await page.getByRole("menuitem", { name: /Other Olga/ }).click();
      await expect(page.getByText("Other Olga's answer")).toBeVisible();
      await page.getByRole("button", { name: /^More/ }).click();
      await expect(
        page.getByRole("menuitem", { name: /Release to Other Olga/ }),
      ).not.toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Escape");

      await page.goto(`${route.path(ids)}?studentId=${ids.ravi}`);
      await page.getByRole("button", { name: /^More/ }).click();
      await expect(
        page.getByRole("menuitem", { name: "Released to Ravi Released" }),
      ).toHaveAttribute("aria-disabled", "true");

      // By question also moves to another student without a reload; Quinn's release must still be on offer
      await page.goto(
        `${route.path(ids)}?mode=question&questionId=${ids.questionId}&studentId=${ids.olga}`,
      );
      const questionMore = page.getByRole("button", { name: /^More/ });
      await hydrated(questionMore);
      await questionMore.click();
      await page
        .getByRole("menuitem", { name: /Release to Other Olga/ })
        .click();
      await expect
        .poll(() =>
          withDb(async (db) =>
            (
              await db
                .collection("test_submission")
                .find({ testId: ids.testId, releasedAt: { $ne: null } })
                .toArray()
            )
              .map((doc) => doc.studentId)
              .sort(),
          ),
        )
        .toEqual([ids.ravi, ids.olga].sort());
      await page
        .getByTestId("question-row")
        .getByRole("link", { name: "Quinn Question graded" })
        .click();
      await expect(page.getByText("Quinn Question's answer")).toBeVisible();
      await page.getByRole("button", { name: /^More/ }).click();
      await expect(
        page.getByRole("menuitem", { name: /Release to Quinn Question/ }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });
  }
});
