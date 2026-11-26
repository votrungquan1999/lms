/**
 * Feature: To grade
 *
 * The teacher's home lists the tests with work waiting, grouped by course
 * with counts, the course holding the oldest waiting hand-in first. Practice
 * tests never count.
 */
import { expect, test } from "@playwright/test";
import { createOwnSchool, type OwnSchool } from "./own-school";
import {
  clearSchoolData,
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

const DAY_MS = 24 * 60 * 60 * 1000;
/** Pushes a hand-in clear of the 24-hour boundary so "n days ago" is stable. */
const MARGIN_MS = 60 * 60 * 1000;

/** The moment a hand-in made `days` whole days ago happened. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS - MARGIN_MS);
}

test.describe("To grade: tests with work waiting", () => {
  test.describe.configure({ mode: "serial" });

  let own: OwnSchool;
  test.afterAll(async () => {
    await own?.remove();
  });

  test("lists waiting tests grouped by course, oldest waiting first, never counting practice tests", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    // Given a school of its own with two courses
    own = await createOwnSchool(browser, "to-grade");
    const schoolId = own.schoolId;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseA = await insertCourse(db, {
        title: "Alpha Course",
        schoolId,
      });
      const courseB = await insertCourse(db, {
        title: "Beta Course",
        schoolId,
      });

      /** A student of the school, enrolled in `courseId`. */
      const student = async (name: string, courseId: string) => {
        const id = await insertStudent(db, { name, schoolIds: [schoolId] });
        await enroll(db, { courseId, studentId: id });
        return id;
      };
      /** A hand-in with one written answer, graded or not. */
      const handIn = async (
        testId: string,
        questionId: string,
        studentId: string,
        at: Date,
        graded: boolean,
      ) => {
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "my answer" },
        });
        await insertSubmission(db, { testId, studentId, submittedAt: at });
        if (graded) await insertGrade(db, { testId, questionId, studentId });
      };

      // Alpha 1: Ann waits (3 days), Ben is fully graded
      const a1 = await insertTest(db, courseA, {
        title: "Alpha One",
        schoolId,
      });
      const a1q = await insertQuestion(db, a1, { type: "free_text" });
      await handIn(a1, a1q, await student("Ann", courseA), daysAgo(3), false);
      await handIn(a1, a1q, await student("Ben", courseA), daysAgo(5), true);

      // Alpha 2: Cy waits (1 day)
      const a2 = await insertTest(db, courseA, {
        title: "Alpha Two",
        schoolId,
      });
      const a2q = await insertQuestion(db, a2, { type: "free_text" });
      await handIn(a2, a2q, await student("Cy", courseA), daysAgo(1), false);

      // Beta 1: Dee waits (2 days); a practice test with a hand-in
      const b1 = await insertTest(db, courseB, { title: "Beta One", schoolId });
      const b1q = await insertQuestion(db, b1, { type: "free_text" });
      const dee = await student("Dee", courseB);
      await handIn(b1, b1q, dee, daysAgo(2), false);
      const practice = await insertTest(db, courseB, {
        title: "Beta Practice",
        isPractice: true,
        schoolId,
      });
      const pq = await insertQuestion(db, practice, { type: "free_text" });
      await handIn(practice, pq, dee, daysAgo(9), false);

      return { courseA, a1, a2, b1, practice };
    });

    // When they open To grade
    const page = await own.context.newPage();
    await page.goto("/admin/grading");
    await expect(page.getByRole("heading", { name: "To grade" })).toBeVisible();

    // Then the summary counts three waiting submissions, not the practice one
    await expect(page.getByText("3 submissions waiting")).toBeVisible();

    // And the groups run Alpha (oldest waiting) then Beta
    const groups = page.getByTestId("to-grade-group");
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toContainText(
      "Alpha Course · 2 waiting · 2 tests",
    );
    await expect(groups.nth(1)).toContainText(
      "Beta Course · 1 waiting · 1 test",
    );

    // And Alpha One (3 days) sits above Alpha Two (1 day)
    const rows = groups.nth(0).locator('[data-testid^="hub-test-card-"]');
    await expect(rows).toHaveCount(2);
    const first = page.getByTestId(`hub-test-card-${ids.a1}`);
    const second = page.getByTestId(`hub-test-card-${ids.a2}`);
    await expect(rows.nth(0)).toHaveAttribute(
      "data-testid",
      `hub-test-card-${ids.a1}`,
    );

    // And each row names who waited longest, what is left, and the question types
    await expect(first).toContainText("1 waiting");
    await expect(first).toContainText(
      "Ann submitted 3 days ago · 1 answer left to grade · 1 of 2 submitted students fully graded",
    );
    await expect(first).toContainText("1 question · 1 written");
    await expect(second).toContainText("Cy submitted yesterday");
    await expect(page.getByTestId(`hub-test-card-${ids.b1}`)).toContainText(
      "Dee submitted 2 days ago",
    );

    // And the title opens the test, By question and Continue grading open grading
    await expect(
      first.getByRole("link", { name: "Alpha One" }),
    ).toHaveAttribute("href", `/admin/courses/${ids.courseA}/tests/${ids.a1}`);
    await expect(
      first.getByRole("link", { name: "By question" }),
    ).toHaveAttribute("href", `/admin/grading/${ids.a1}?mode=question`);
    await expect(
      first.getByRole("link", { name: "Continue grading" }),
    ).toHaveAttribute("href", `/admin/grading/${ids.a1}`);

    // And the practice test appears nowhere
    await expect(page.getByText("Beta Practice")).toHaveCount(0);
    await expect(page.getByTestId(`hub-test-card-${ids.practice}`)).toHaveCount(
      0,
    );
    await page.close();
  });
});
