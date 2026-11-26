/**
 * Feature: To grade
 *
 * The teacher's home lists the tests with work waiting, grouped by course
 * with counts, the course holding the oldest waiting hand-in first. Practice
 * tests never count.
 */
import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
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
  test.beforeAll(async ({ browser }) => {
    own = await createOwnSchool(browser, "to-grade");
  });
  test.afterAll(async () => {
    await own?.remove();
  });

  test("lists waiting tests grouped by course, oldest waiting first, never counting practice tests", async () => {
    test.setTimeout(120_000);

    // Given a school of its own with two courses
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

  test("tests whose grades students cannot see yet sit in a collapsed group, each with Release", async () => {
    test.setTimeout(120_000);

    // Given graded tests: R and Q hidden from students, S shown on submit, W still partly waiting, P practice
    const schoolId = own.schoolId;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const course = await insertCourse(db, {
        title: "Gamma Course",
        schoolId,
      });

      /** A test with `count` fully graded hand-ins; `releaseFirst` releases the first student's grade alone. */
      const gradedTest = async (
        title: string,
        options: {
          count?: number;
          showGradeAfterSubmit?: boolean;
          isPractice?: boolean;
          releaseFirst?: boolean;
          waitingToo?: boolean;
        },
      ) => {
        const testId = await insertTest(db, course, {
          title,
          schoolId,
          showGradeAfterSubmit: options.showGradeAfterSubmit ?? false,
          isPractice: options.isPractice ?? false,
        });
        const questionId = await insertQuestion(db, testId, {
          type: "free_text",
        });
        const count = options.count ?? 3;
        for (let i = 0; i < count; i++) {
          const studentId = await insertStudent(db, { schoolIds: [schoolId] });
          await enroll(db, { courseId: course, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "x" },
          });
          await insertSubmission(db, {
            testId,
            studentId,
            releasedAt: options.releaseFirst && i === 0 ? new Date() : null,
          });
          await insertGrade(db, { testId, questionId, studentId });
        }
        if (options.waitingToo) {
          const studentId = await insertStudent(db, { schoolIds: [schoolId] });
          await enroll(db, { courseId: course, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "x" },
          });
          await insertSubmission(db, { testId, studentId });
        }
        return testId;
      };

      return {
        course,
        r: await gradedTest("Review R", {}),
        q: await gradedTest("Review Q", { releaseFirst: true }),
        s: await gradedTest("Review S", { showGradeAfterSubmit: true }),
        w: await gradedTest("Review W", { count: 1, waitingToo: true }),
        p: await gradedTest("Review P", { isPractice: true }),
      };
    });
    const page = await own.context.newPage();
    await page.goto("/admin/grading");

    // Then the group is collapsed and counts the two tests ready to release
    const toggle = page.getByRole("button", { name: /Graded, not released/ });
    await expect(toggle).toContainText("(2)");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId(`hub-test-card-${ids.r}`)).toHaveCount(0);

    // And the summary names the waiting submission and the two tests
    await expect(
      page.getByText("1 submission waiting · 2 tests graded but not released"),
    ).toBeVisible();

    // When the teacher opens it
    await hydrated(toggle);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Then R and Q show under their course, and S, W and P do not
    const rowR = page.getByTestId(`hub-test-card-${ids.r}`);
    const rowQ = page.getByTestId(`hub-test-card-${ids.q}`);
    await expect(rowR).toContainText("3 graded");
    await expect(rowR).toContainText("Not released");
    await expect(rowR).toContainText("all 3 submissions graded");
    await expect(rowQ).toContainText("Released to 1 of 3");
    await expect(rowR.getByRole("button", { name: "Release" })).toBeVisible();
    for (const hidden of [ids.s, ids.p]) {
      await expect(page.getByTestId(`hub-test-card-${hidden}`)).toHaveCount(0);
    }
    // W stays under Needs grading only, because a student still waits
    await expect(page.getByTestId(`hub-test-card-${ids.w}`)).toHaveCount(1);
    await expect(
      page
        .locator("section", { has: toggle })
        .getByTestId(`hub-test-card-${ids.w}`),
    ).toHaveCount(0);

    // When R is released
    await rowR.getByRole("button", { name: "Release" }).click();

    // Then R leaves the group, the count drops and the summary follows
    await expect(page.getByTestId(`hub-test-card-${ids.r}`)).toHaveCount(0);
    await expect(toggle).toContainText("(1)");
    await expect(
      page.getByText("1 submission waiting · 1 test graded but not released"),
    ).toBeVisible();
    await page.close();
  });

  test("when nothing waits, shows All caught up with a link to Courses, even with a practice test handed in", async () => {
    test.setTimeout(120_000);

    // Given a school with one course and no hand-ins
    const schoolId = own.schoolId;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const course = await insertCourse(db, {
        title: "Quiet Course",
        schoolId,
      });
      return { course };
    });
    const page = await own.context.newPage();
    await page.goto("/admin/grading");

    // Then the summary says nothing waits and both sections show their empty state
    await expect(page.getByRole("heading", { name: "To grade" })).toBeVisible();
    await expect(
      page.getByText("Nothing waiting · every graded test is released", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Needs grading (0)" }),
    ).toBeVisible();
    await expect(page.getByText("All caught up")).toBeVisible();
    await expect(
      page.getByText(
        "No submissions are waiting for a grade. New ones show up here as students hand them in.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Graded, not released (0)" }),
    ).toBeVisible();
    await expect(page.getByText("Nothing to release.")).toBeVisible();

    // And its link leads to Courses
    await expect(
      page.getByRole("link", { name: "Go to courses" }),
    ).toHaveAttribute("href", "/admin/courses");

    // When a practice test has an answered hand-in
    await withDb(async (db) => {
      const practice = await insertTest(db, ids.course, {
        title: "Quiet Practice",
        isPractice: true,
        schoolId,
      });
      const q = await insertQuestion(db, practice, { type: "free_text" });
      const studentId = await insertStudent(db, { schoolIds: [schoolId] });
      await enroll(db, { courseId: ids.course, studentId });
      await insertAnswer(db, {
        testId: practice,
        questionId: q,
        studentId,
        answer: { type: "free_text", text: "x" },
      });
      await insertSubmission(db, { testId: practice, studentId });
    });
    await page.reload();

    // Then the school is still caught up
    await expect(page.getByText("All caught up")).toBeVisible();
    await expect(page.getByText("Quiet Practice")).toHaveCount(0);
    await page.close();
  });

  test("with nothing waiting but a graded test to release, shows All caught up and the Graded group", async () => {
    test.setTimeout(120_000);

    // Given the only hand-in is fully graded and hidden from the student
    const schoolId = own.schoolId;
    await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const course = await insertCourse(db, { title: "Done Course", schoolId });
      const testId = await insertTest(db, course, {
        title: "Done Test",
        schoolId,
        showGradeAfterSubmit: false,
      });
      const questionId = await insertQuestion(db, testId, {
        type: "free_text",
      });
      const studentId = await insertStudent(db, { schoolIds: [schoolId] });
      await enroll(db, { courseId: course, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "x" },
      });
      await insertSubmission(db, { testId, studentId });
      await insertGrade(db, { testId, questionId, studentId });
    });

    // When they open To grade
    const page = await own.context.newPage();
    await page.goto("/admin/grading");

    // Then both the empty card and the group to release show
    await expect(page.getByText("All caught up")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Graded, not released \(1\)/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Nothing waiting · 1 test graded but not released", {
        exact: true,
      }),
    ).toBeVisible();
    await page.close();
  });
});
