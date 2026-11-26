/**
 * Feature: Course page
 *
 * A course page has the tabs Tests | Students | Materials as separate URLs, a
 * header with Export results and New test, and every tab guards its own course.
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
/** Pushes a hand-in clear of the 24-hour boundary so "yesterday" is stable. */
const MARGIN_MS = 60 * 60 * 1000;

test.describe("Course page", () => {
  test.describe.configure({ mode: "serial" });

  let own: OwnSchool;
  test.beforeAll(async ({ browser }) => {
    own = await createOwnSchool(browser, "course-page");
  });
  test.afterAll(async () => {
    await own?.remove();
  });

  test("a course page has the tabs Tests, Students and Materials as their own pages, with Export results and New test in the header", async () => {
    test.setTimeout(180_000);

    // Given a course with 2 students and 3 tests
    const schoolId = own.schoolId;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const id = await insertCourse(db, { title: "Tabbed Course", schoolId });
      for (const name of ["Olive", "Pat"]) {
        const studentId = await insertStudent(db, {
          name,
          schoolIds: [schoolId],
        });
        await enroll(db, { courseId: id, studentId });
      }
      for (const title of ["Quiz 1", "Quiz 2", "Quiz 3"]) {
        await insertTest(db, id, { title, schoolId });
      }
      return id;
    });
    const base = `/admin/courses/${courseId}`;

    // When the teacher opens the course
    const page = await own.context.newPage();
    await page.goto(base);

    // Then the page names the course in the breadcrumb and the title, with its counts
    const crumb = page.getByRole("navigation", { name: "breadcrumb" });
    await expect(crumb).toContainText("Courses");
    await expect(crumb.locator('[aria-current="page"]')).toHaveText(
      "Tabbed Course",
    );
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Tabbed Course" }),
    ).toBeVisible();
    await expect(main.getByText("2 students · 3 tests")).toBeVisible();

    // And the header offers Export results and New test
    await expect(
      main.getByRole("link", { name: "Export results" }),
    ).toHaveAttribute("href", `${base}/results-report`);
    await main.getByRole("button", { name: "New test" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Create Test" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // And the tab strip marks Tests as the current tab
    const tabs = page.getByRole("navigation", { name: "Course sections" });
    await expect(tabs.getByRole("link", { name: "Tests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      tabs.getByRole("link", { name: "Students" }),
    ).not.toHaveAttribute("aria-current", "page");

    // When they open Students
    await tabs.getByRole("link", { name: "Students" }).click();

    // Then it is its own page with the enrolment section and the join link
    await expect(page).toHaveURL(`${base}/students`);
    await expect(
      main.getByRole("heading", { name: "Enrolled Students (2)" }),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Get Join Link" }),
    ).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Students" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // When they open Materials
    await tabs.getByRole("link", { name: "Materials" }).click();

    // Then it is its own page with the materials section
    await expect(page).toHaveURL(`${base}/materials`);
    await expect(
      main.getByRole("heading", { name: "Materials (0)" }),
    ).toBeVisible();

    // When they go back
    await page.goBack();

    // Then they return to the Students tab
    await expect(page).toHaveURL(`${base}/students`);
    await expect(
      main.getByRole("heading", { name: "Enrolled Students (2)" }),
    ).toBeVisible();

    // And each tab opened directly still shows the course crumb
    for (const path of ["", "/students", "/materials"]) {
      await page.goto(`${base}${path}`);
      await expect(crumb.locator('[aria-current="page"]')).toHaveText(
        "Tabbed Course",
      );
    }
    await page.close();
  });

  test("on a phone the course header puts Export results and New test below the title and counts; on a desktop they sit beside them", async () => {
    // Given a course
    const schoolId = own.schoolId;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      return insertCourse(db, { title: "Phone Course", schoolId });
    });
    const page = await own.context.newPage();
    const main = page.getByRole("main");
    const counts = main.getByText("0 students · 0 tests");
    const exportLink = main.getByRole("link", { name: "Export results" });
    const newTest = main.getByRole("button", { name: "New test" });

    // When the teacher opens it on a phone
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/admin/courses/${courseId}`);
    await expect(counts).toBeVisible();

    // Then both buttons start below the counts line, which reads on one line
    const countsBox = await counts.boundingBox();
    const countsLine = await counts.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).lineHeight),
    );
    expect(countsBox?.height).toBeLessThan(countsLine * 1.5);
    const countsBottom = (countsBox?.y ?? 0) + (countsBox?.height ?? 0);
    expect((await exportLink.boundingBox())?.y).toBeGreaterThanOrEqual(
      countsBottom,
    );
    expect((await newTest.boundingBox())?.y).toBeGreaterThanOrEqual(
      countsBottom,
    );
    await expect(exportLink).toBeInViewport({ ratio: 1 });
    await expect(newTest).toBeInViewport({ ratio: 1 });

    // When the window is a desktop
    await page.setViewportSize({ width: 1280, height: 800 });

    // Then the buttons sit beside the title, above the counts line
    await expect
      .poll(async () => (await exportLink.boundingBox())?.y ?? 0)
      .toBeLessThan((await counts.boundingBox())?.y ?? 0);
    await page.close();
  });

  test("a course of another school is not found on any tab", async () => {
    test.setTimeout(120_000);

    // Given a course that belongs to the shared e2e school, not this one
    const foreignId = await withDb((db) =>
      insertCourse(db, { title: "Foreign Course" }),
    );

    // When the teacher opens each tab of it
    const page = await own.context.newPage();
    for (const path of ["", "/students", "/materials"]) {
      await page.goto(`/admin/courses/${foreignId}${path}`);

      // Then the tab is not found, and no course page shows
      await expect(
        page.getByText("This page could not be found."),
      ).toBeVisible();
      await expect(page.getByText("Foreign Course")).toHaveCount(0);
      await expect(
        page.getByRole("navigation", { name: "Course sections" }),
      ).toHaveCount(0);
    }
    await page.close();
  });

  test("the Tests tab lists tests to grade and tests ready to release in Needs your action, and Release moves a test out of it", async () => {
    test.setTimeout(180_000);

    // Given a course with 5 students, a test W with 1 of 2 hand-ins waiting,
    // a test R fully graded but hidden, a practice test and an untouched test
    const schoolId = own.schoolId;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseId = await insertCourse(db, {
        title: "Action Course",
        schoolId,
      });
      const students: string[] = [];
      for (const name of ["Olive", "Pat", "Quinn", "Rae", "Sam"]) {
        const studentId = await insertStudent(db, {
          name,
          schoolIds: [schoolId],
        });
        await enroll(db, { courseId, studentId });
        students.push(studentId);
      }
      const [olive, pat, quinn] = students;

      /** A hand-in answering every question, graded on the given ones. */
      const handIn = async (
        testId: string,
        questionIds: string[],
        studentId: string,
        gradedIds: string[],
        at: Date,
      ) => {
        for (const questionId of questionIds) {
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "x" },
          });
        }
        await insertSubmission(db, { testId, studentId, submittedAt: at });
        for (const questionId of gradedIds) {
          await insertGrade(db, { testId, questionId, studentId });
        }
      };

      const w = await insertTest(db, courseId, {
        title: "Waiting Quiz",
        schoolId,
        showGradeAfterSubmit: false,
      });
      const wq1 = await insertQuestion(db, w, { type: "free_text", order: 1 });
      const wq2 = await insertQuestion(db, w, { type: "free_text", order: 2 });
      const yesterday = new Date(Date.now() - DAY_MS - MARGIN_MS);
      await handIn(w, [wq1, wq2], olive, [wq1], yesterday);
      await handIn(w, [wq1, wq2], pat, [wq1, wq2], yesterday);

      const r = await insertTest(db, courseId, {
        title: "Release Quiz",
        schoolId,
        showGradeAfterSubmit: false,
      });
      const rq = await insertQuestion(db, r, { type: "free_text" });
      await handIn(r, [rq], quinn, [rq], yesterday);

      const practice = await insertTest(db, courseId, {
        title: "Practice Quiz",
        schoolId,
        isPractice: true,
      });
      const pq = await insertQuestion(db, practice, { type: "free_text" });
      await handIn(practice, [pq], olive, [], yesterday);

      await insertTest(db, courseId, { title: "Untouched Quiz", schoolId });
      return { courseId, w, r };
    });

    // When the teacher opens the course
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${ids.courseId}`);

    // Then Needs your action holds only W and R
    const card = page.getByRole("region", { name: "Needs your action" });
    await expect(
      card.getByRole("heading", { name: "Needs your action (2)" }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Waiting Quiz" }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Release Quiz" }),
    ).toBeVisible();
    await expect(card.getByText("Practice Quiz")).toHaveCount(0);
    await expect(card.getByText("Untouched Quiz")).toHaveCount(0);

    // And W shows who waits, what is left, and Grade into the course grading page
    const rowW = card.getByTestId(`test-row-${ids.w}`);
    await expect(rowW).toContainText("2 of 5");
    await expect(rowW).toContainText("1 waiting");
    await expect(rowW).toContainText("Not released");
    await expect(rowW).toContainText(
      "Olive submitted yesterday · 1 answer left · 2 questions",
    );
    await expect(rowW.getByRole("link", { name: "Grade" })).toHaveAttribute(
      "href",
      `/admin/courses/${ids.courseId}/tests/${ids.w}/grading`,
    );

    // And R is all graded, not visible to students, with Release
    const rowR = card.getByTestId(`test-row-${ids.r}`);
    await expect(rowR).toContainText("1 of 5");
    await expect(rowR).toContainText("All graded");
    await expect(rowR).toContainText("Not released");
    await expect(rowR).toContainText(
      "All 1 submission graded · students can't see their grades yet",
    );

    // When they release R
    const release = rowR.getByRole("button", { name: "Release" });
    await hydrated(release);
    await release.click();

    // Then R leaves the card and W stays
    await expect(
      card.getByRole("heading", { name: "Needs your action (1)" }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: "Release Quiz" })).toHaveCount(
      0,
    );
    await expect(
      card.getByRole("link", { name: "Waiting Quiz" }),
    ).toBeVisible();
    await page.close();
  });

  test("a course with nothing to act on shows no Needs your action card", async () => {
    test.setTimeout(120_000);

    // Given a course whose only test has no hand-ins
    const schoolId = own.schoolId;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const id = await insertCourse(db, { title: "Quiet Course", schoolId });
      await insertTest(db, id, { title: "Quiet Quiz", schoolId });
      return id;
    });

    // When the teacher opens it
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${courseId}`);

    // Then the page shows the test but no action card
    await expect(page.getByText("Quiet Quiz")).toBeVisible();
    await expect(page.getByText("Needs your action")).toHaveCount(0);
    await page.close();
  });
});
