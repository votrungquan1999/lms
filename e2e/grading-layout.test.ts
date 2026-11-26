import { expect, test } from "@playwright/test";
import { createOwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  expectNoPageOverflow,
  expectNotClipped,
  expectSingleLine,
  expectWrapped,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

test.describe("Grading layout", () => {
  test("hub rows have a visible gap between them, and an unbroken test title stays inside its own row", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    // Long enough to wrap even across the full-width row.
    const unbrokenTitle = `[layout] averylongunbrokenhubtitle${"thatshouldwrapinsteadofoverflowing".repeat(4)}`;
    // Its own school keeps other specs' waiting work out of the page, so the
    // gap measured is the one between these two rows.
    const own = await createOwnSchool(browser, "grading-layout");
    try {
      const { schoolId } = own;
      const { testAId, testBId } = await withDb(async (db) => {
        await clearSchoolData(db, schoolId);
        /** A test with one student's written answer handed in and waiting. */
        const waitingTest = async (courseTitle: string, testTitle: string) => {
          const courseId = await insertCourse(db, {
            title: courseTitle,
            schoolId,
          });
          const testId = await insertTest(db, courseId, {
            title: testTitle,
            schoolId,
          });
          const questionId = await insertQuestion(db, testId);
          const studentId = await insertStudent(db, { schoolIds: [schoolId] });
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "x" },
          });
          await insertSubmission(db, { testId, studentId });
          return testId;
        };
        const testAId = await waitingTest(
          "[layout] Grading Hub A",
          "[layout] Short Hub Test",
        );
        const testBId = await waitingTest(
          "[layout] Grading Hub B",
          unbrokenTitle,
        );
        return { testAId, testBId };
      });

      const page = await own.context.newPage();
      await page.goto("/admin/grading");
      const rowA = page.getByTestId(`hub-test-card-${testAId}`);
      const rowB = page.getByTestId(`hub-test-card-${testBId}`);
      const [boxA, boxB] = await Promise.all([
        rowA.boundingBox(),
        rowB.boundingBox(),
      ]);
      if (!boxA || !boxB) throw new Error("Hub rows not found");

      const [top, bottom] = boxA.y <= boxB.y ? [boxA, boxB] : [boxB, boxA];
      expect(bottom.y - (top.y + top.height)).toBeGreaterThanOrEqual(8);

      await expect(
        rowB.getByText(unbrokenTitle, { exact: true }),
      ).toBeVisible();
      await expectWrapped(rowB.getByText(unbrokenTitle, { exact: true }));
      await expectNotClipped(rowB);
      await expectNoPageOverflow(page);
      await page.close();
    } finally {
      await own.remove();
    }
  });

  test("a released test's unbroken title never forces either grading page to scroll sideways", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenTitle =
      "[layout] averylongunbrokentitlethatshouldwrapinsteadofoverflowingthepage1234567890@example.com";
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId, {
        title: unbrokenTitle,
        gradesReleasedAt: new Date(),
      });
      return { courseId, testId };
    });

    await page.goto(`/admin/grading/${testId}`);
    await expect(
      page.getByRole("heading", { name: `Grade: ${unbrokenTitle}` }),
    ).toBeVisible();
    await expectNoPageOverflow(page);

    await page.goto(`/admin/courses/${courseId}/tests/${testId}/grading`);
    await expect(
      page.getByRole("heading", { name: `Grade: ${unbrokenTitle}` }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  });
});

test.describe("Grading layout — long names, titles and links stay readable", () => {
  test("the breadcrumb never clips its trail on either grading route, even with a long course and test title", async ({
    page,
  }) => {
    const longCourseTitle = `[layout] ${"An Extremely Long Grading Course Title ".repeat(4)}`;
    const longTestTitle = `[layout] ${"An Extremely Long Grading Test Title ".repeat(4)}`;
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: longCourseTitle });
      const testId = await insertTest(db, courseId, { title: longTestTitle });
      return { courseId, testId };
    });

    for (const url of [
      `/admin/grading/${testId}`,
      `/admin/courses/${courseId}/tests/${testId}/grading`,
    ]) {
      await page.goto(url);
      const nav = page.getByRole("navigation", { name: "breadcrumb" });
      const main = page.getByRole("main");
      const [mainBox, navBox, titleBox] = await Promise.all([
        main.boundingBox(),
        nav.boundingBox(),
        page.getByRole("heading", { level: 1 }).boundingBox(),
      ]);
      if (!mainBox || !navBox || !titleBox) {
        throw new Error(`Breadcrumb or title not found at ${url}`);
      }
      // The breadcrumb sits inside the page content, above the title.
      expect(navBox.y).toBeGreaterThanOrEqual(mainBox.y - 0.5);
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(titleBox.y + 0.5);
      await expectNoPageOverflow(page);
    }

    // The grading route truncates its current segment to one line (full
    // text in the tooltip); the course route's trail wraps onto more lines.
    await page.goto(`/admin/grading/${testId}`);
    await expectSingleLine(
      page
        .getByRole("navigation", { name: "breadcrumb" })
        .locator('[aria-current="page"]'),
    );
    await page.goto(`/admin/courses/${courseId}/tests/${testId}/grading`);
    await expectWrapped(
      page.getByRole("navigation", { name: "breadcrumb" }).getByRole("list"),
    );
  });

  test("the grading page's current breadcrumb segment carries a full-text tooltip and never forces the page to scroll sideways", async ({
    page,
  }) => {
    const fullTitle = `[layout] ${"AVeryLongUnbrokenGradingBreadcrumbTitleToken".repeat(5)}`;
    const { testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId, { title: fullTitle });
      return { testId };
    });

    await page.goto(`/admin/grading/${testId}`);
    const current = page
      .getByRole("navigation", { name: "breadcrumb" })
      .getByText(fullTitle, { exact: false });
    const titleAttr = await current.getAttribute("title");
    expect(titleAttr).toContain(fullTitle);
    await expectNoPageOverflow(page);
  });

  test("the course route's 3-link breadcrumb never forces the page to scroll sideways, even with one long unbroken course and test title", async ({
    page,
  }) => {
    // No hyphens/spaces: browsers treat those as soft break points even
    // without a wrap utility, so a broken string would not reproduce this.
    const unbrokenCourseTitle = `[layout] averylongunbrokenbreadcrumbcoursetitle${"thatmustneveroverflowthepage".repeat(5)}`;
    const unbrokenTestTitle = `[layout] averylongunbrokenbreadcrumbtesttitle${"thatmustneveroverflowthepage".repeat(5)}`;
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: unbrokenCourseTitle });
      const testId = await insertTest(db, courseId, {
        title: unbrokenTestTitle,
      });
      return { courseId, testId };
    });

    await page.goto(`/admin/courses/${courseId}/tests/${testId}/grading`);
    // Middle segments wrap in full (the bar grows) — never truncated away.
    const nav = page.getByRole("navigation", { name: "breadcrumb" });
    await expectWrapped(nav.getByRole("link", { name: unbrokenCourseTitle }));
    await expectWrapped(nav.getByRole("link", { name: unbrokenTestTitle }));
    await expectNoPageOverflow(page);
  });

  test("a long free-text answer with an unbreakable URL never forces the grading grid open, on either route and in either pivot", async ({
    page,
  }) => {
    const longAnswer = `https://example.com/${"a".repeat(120)}`;
    const { courseId, testId, questionId, studentId } = await withDb(
      async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId);
        const studentId = await insertStudent(db);
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: longAnswer },
        });
        return { courseId, testId, questionId, studentId };
      },
    );

    for (const basePath of [
      `/admin/grading/${testId}`,
      `/admin/courses/${courseId}/tests/${testId}/grading`,
    ]) {
      await page.goto(`${basePath}?studentId=${studentId}`);
      await expect(page.getByText(longAnswer, { exact: true })).toBeVisible();
      await expectNoPageOverflow(page);

      await page.goto(`${basePath}?mode=question&questionId=${questionId}`);
      await expect(page.getByText(longAnswer, { exact: true })).toBeVisible();
      await expectNoPageOverflow(page);
    }
  });

  test("the By-question roster pane keeps its own height instead of stretching to match a tall main pane", async ({
    page,
  }) => {
    const { testId, questionId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const questionId = await insertQuestion(db, testId);
      for (let i = 0; i < 8; i++) {
        const studentId = await insertStudent(db, {
          name: `[layout] Roster Student ${i}`,
        });
        await enroll(db, { courseId, studentId });
      }
      return { testId, questionId };
    });

    await page.goto(
      `/admin/grading/${testId}?mode=question&questionId=${questionId}`,
    );
    const [rosterBox, mainBox] = await Promise.all([
      page.getByTestId("grading-roster").boundingBox(),
      page.getByTestId("grading-main-pane").boundingBox(),
    ]);
    if (!rosterBox || !mainBox) throw new Error("Roster/main pane not found");
    expect(rosterBox.height).toBeLessThan(mainBox.height);
  });

  test("a long student name never breaks the grading card header — the pill stays one line while the name wraps, in both pivots", async ({
    page,
  }) => {
    // The spaced words squeeze the pill; the unbroken run has no break point,
    // so only the name's own wrap-anywhere keeps it inside the card.
    const longName = `[layout] Nguyen Thi Phuong Thao ${"Extra Middle Name ".repeat(6)}${"Averylongunbrokenmiddlename".repeat(7)}`;
    const { testId, questionId, studentId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const questionId = await insertQuestion(db, testId);
      const studentId = await insertStudent(db, { name: longName });
      await enroll(db, { courseId, studentId });
      return { testId, questionId, studentId };
    });

    // By-student pivot: name wraps, the graded-count pill stays one line.
    await page.goto(`/admin/grading/${testId}?studentId=${studentId}`);
    const card = page.getByTestId(`student-card-${studentId}`);
    const name = card.getByText(longName, { exact: false });
    await expect(name).toBeVisible();
    await expectWrapped(name);
    const pill = card.getByText(/graded/);
    await expectSingleLine(pill);
    await expectNoPageOverflow(page);

    // By-question pivot: the per-student row header.
    await page.goto(
      `/admin/grading/${testId}?mode=question&questionId=${questionId}`,
    );
    const row = page.getByTestId(`student-card-${studentId}`);
    const rowName = row.getByText(longName, { exact: false });
    await expect(rowName).toBeVisible();
    await expectWrapped(rowName);
    await expectNoPageOverflow(page);
  });
});
