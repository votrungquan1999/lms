/**
 * Feature: Courses list
 *
 * Each course is a row with its students, tests, a grading pill and one
 * action; the course with the most work waiting comes first.
 */
import { expect, test } from "@playwright/test";
import { createOwnSchool, type OwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  expectNoPageOverflow,
  insertAnswer,
  insertCourse,
  insertGrade,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

test.describe("Courses list", () => {
  test.describe.configure({ mode: "serial" });

  let own: OwnSchool;
  test.beforeAll(async ({ browser }) => {
    own = await createOwnSchool(browser, "courses-list");
  });
  test.afterAll(async () => {
    await own?.remove();
  });

  test("shows each course as a row with its counts, most waiting first, then newest", async () => {
    test.setTimeout(120_000);

    // Given course A (2 students, 3 tests, one hand-in waiting on A1), course B
    // (one test graded but not released) and course C (empty), created in that order
    const schoolId = own.schoolId;
    const ago = (ms: number) => new Date(Date.now() - ms);
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const a = await insertCourse(db, {
        title: "Course A",
        description: "Alpha description",
        schoolId,
        createdAt: ago(3000),
      });
      const b = await insertCourse(db, {
        title: "Course B",
        schoolId,
        createdAt: ago(2000),
      });
      const c = await insertCourse(db, {
        title: "Course C",
        schoolId,
        createdAt: ago(1000),
      });

      /** A student of the school, enrolled in `courseId`. */
      const student = async (courseId: string) => {
        const studentId = await insertStudent(db, { schoolIds: [schoolId] });
        await enroll(db, { courseId, studentId });
        return studentId;
      };
      /** A hand-in with one written answer, graded or not. */
      const handIn = async (
        testId: string,
        studentId: string,
        graded: boolean,
      ) => {
        const questionId = await insertQuestion(db, testId, {
          type: "free_text",
        });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "x" },
        });
        await insertSubmission(db, { testId, studentId });
        if (graded) await insertGrade(db, { testId, questionId, studentId });
      };

      const a1 = await insertTest(db, a, { title: "A1", schoolId });
      await insertTest(db, a, { title: "A2", schoolId });
      await insertTest(db, a, { title: "A3", schoolId });
      await handIn(a1, await student(a), false);
      await student(a);

      const b1 = await insertTest(db, b, {
        title: "B1",
        schoolId,
        showGradeAfterSubmit: false,
      });
      await handIn(b1, await student(b), true);
      return { a, b, c };
    });

    // When the teacher opens Courses
    const page = await own.context.newPage();
    await page.goto("/admin/courses");

    // Then the summary counts courses and waiting submissions
    await expect(
      page.getByText("3 courses · 1 submission waiting for a grade"),
    ).toBeVisible();

    // And the rows run A (waiting), C (newest), B
    const rows = page.getByTestId("course-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Course A");
    await expect(rows.nth(1)).toContainText("Course C");
    await expect(rows.nth(2)).toContainText("Course B");

    // And row A names its waiting test, counts students and tests, and offers Grade
    const rowA = rows.nth(0);
    await expect(rowA).toContainText("A1 has 1 submission waiting");
    await expect(rowA.getByTestId("course-students")).toHaveText("2");
    await expect(rowA.getByTestId("course-tests")).toHaveText("3");
    await expect(rowA).toContainText("1 waiting");
    await expect(rowA.getByRole("link", { name: "Grade" })).toHaveAttribute(
      "href",
      `/admin/courses/${ids.a}`,
    );

    // And row B names its test to release, and row C says it has no tests
    const rowB = rows.nth(2);
    await expect(rowB).toContainText("B1 graded, not released");
    await expect(rowB).toContainText("Nothing waiting");
    await expect(rowB.getByRole("link", { name: "Open" })).toBeVisible();
    const rowC = rows.nth(1);
    await expect(rowC).toContainText("No tests yet");
    await expect(rowC.getByRole("link", { name: "Open" })).toBeVisible();

    // And the list shows no course description
    await expect(page.getByText("Alpha description")).toHaveCount(0);

    // And on a phone each row still shows its grading pill without overflowing
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(
      rowA.getByText("1 waiting", { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      rowB
        .getByText("Nothing waiting", { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expectNoPageOverflow(page);
    await page.close();
  });
});
