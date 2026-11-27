import { expect, test } from "@playwright/test";
import { createOwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  expectNoPageOverflow,
  expectNotClipped,
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

  test("a long student name never breaks the grading card header or the student picker — the name wraps in both pivots", async ({
    page,
  }) => {
    // The spaced words wrap normally; the unbroken run has no break point,
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

    // By-student pivot: the name wraps.
    await page.goto(`/admin/grading/${testId}?studentId=${studentId}`);
    const card = page.getByTestId(`student-card-${studentId}`);
    const name = card.getByText(longName, { exact: false }).first();
    await expect(name).toBeVisible();
    await expectWrapped(name);
    const panelName = card
      .getByTestId("grade-card")
      .getByRole("heading", { name: /Grade · Q1/ });
    await expect(panelName).toBeVisible();
    await expectWrapped(panelName);
    await expectNoPageOverflow(page);

    // The picker's trigger and its list keep the long name inside the page.
    await page.getByRole("button", { name: "Student picker" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoPageOverflow(page);
    await page.keyboard.press("Escape");

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
