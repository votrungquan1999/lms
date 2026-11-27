import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import { createOwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  expectNoPageOverflow,
  expectNotClipped,
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
      // A hand-in, so the By-question pivot has a box and an answer for her.
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "an answer" },
      });
      await insertSubmission(db, { testId, studentId });
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

    // By-question pivot: the grade panel's header.
    await page.goto(
      `/admin/grading/${testId}?mode=question&questionId=${questionId}&studentId=${studentId}`,
    );
    const questionPanelName = page
      .getByTestId("grade-card")
      .getByRole("heading", { name: /Grade · Q1/ });
    await expect(questionPanelName).toBeVisible();
    await expectWrapped(questionPanelName);
    await expectNoPageOverflow(page);
  });
});

const TABLET = { width: 834, height: 1194 };
const PHONE = { width: 390, height: 844 };

const tabletRoutes = [
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

const pivots = [
  { name: "By student", query: "" },
  { name: "By question", query: "&mode=question" },
];

/** A test with a long title, 60 questions and two students who answered the first one. */
async function seedTabletTest() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId, {
      title: "[tablet] a quite long test title that is longer than the bar",
    });
    const questionIds: string[] = [];
    for (let order = 1; order <= 60; order++) {
      questionIds.push(
        await insertQuestion(db, testId, {
          title: `[tablet] Question ${order}`,
        }),
      );
    }
    const studentIds: string[] = [];
    for (const name of [
      "Ann Tablet Longname Studentwithaverylongfamilyname",
      "Ben Tablet",
    ]) {
      const studentId = await insertStudent(db, { name });
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId: questionIds[0] as string,
        studentId,
        answer: { type: "free_text", text: `${name} answer` },
      });
      await insertSubmission(db, { testId, studentId });
      studentIds.push(studentId);
    }
    return {
      courseId,
      testId,
      questionId: questionIds[0] as string,
      ann: studentIds[0] as string,
    };
  });
}

test.describe("Grading on a tablet", () => {
  test.use({ viewport: TABLET });

  for (const route of tabletRoutes) {
    for (const pivot of pivots) {
      test(`on ${route.name} ${pivot.name} wraps the top bar to two rows and folds the grade panel into a bottom bar that expands`, async ({
        page,
      }) => {
        const ids = await seedTabletTest();
        await page.goto(
          `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.questionId}${pivot.query}`,
        );
        const bar = page.getByTestId("grading-top-bar");
        const panel = page.getByTestId("grade-card");
        const save = panel.getByRole("button", { name: /^Save & next/ });
        await hydrated(save);
        await expectNoPageOverflow(page);

        // The top bar holds two rows: the way back and the mode on the first, the position on the second
        const back = bar.getByRole("link").first();
        const position = bar
          .getByTestId(
            pivot.name === "By student"
              ? "grading-student-position"
              : "grading-question-position",
          )
          .first();
        const [backBox, positionBox] = await Promise.all([
          back.boundingBox(),
          position.boundingBox(),
        ]);
        expect(positionBox?.y ?? 0).toBeGreaterThan(
          (backBox?.y ?? 0) + (backBox?.height ?? 0) - 1,
        );

        // The grade panel is a bar along the bottom with the score and Save & next in reach
        const score = panel.getByLabel("Score (0–100):");
        await expect(score).toBeVisible();
        await expect(save).toBeVisible();
        await expect(
          panel.getByLabel("Feedback:", { exact: true }),
        ).toBeHidden();
        const collapsed = await panel.boundingBox();
        expect(collapsed?.height ?? 0).toBeLessThanOrEqual(80);
        expect((collapsed?.y ?? 0) + (collapsed?.height ?? 0)).toBeGreaterThan(
          TABLET.height - 100,
        );

        // A typed score survives expanding and collapsing, and is what Save & next saves from the bar
        await score.fill("55");
        await panel.getByRole("button", { name: "Feedback" }).click();
        await expect(
          panel.getByLabel("Feedback:", { exact: true }),
        ).toBeVisible();
        await panel.getByLabel("Feedback:", { exact: true }).fill("kept");
        await panel.getByRole("button", { name: "Collapse" }).click();
        await expect(
          panel.getByLabel("Feedback:", { exact: true }),
        ).toBeHidden();
        await expect(score).toHaveValue("55");
        await save.click();
        await expect
          .poll(() =>
            withDb(async (db) => {
              const grade = await db.collection("grade").findOne({
                studentId: ids.ann,
                questionId: ids.questionId,
              });
              return [grade?.score, grade?.feedback];
            }),
          )
          .toEqual([55, "kept"]);
      });
    }
  }

  for (const route of tabletRoutes) {
    test(`on ${route.name} the folded grade bar still says the answer changed after its grade`, async ({
      page,
    }) => {
      const minute = 60_000;
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[tablet-changed] Question",
        });
        const studentId = await insertStudent(db, { name: "Cleo Folded" });
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "first try" },
          submittedAt: new Date(Date.now() - 10 * minute),
        });
        await insertGrade(db, {
          testId,
          questionId,
          studentId,
          score: 70,
          feedback: "solid",
          gradedAt: new Date(Date.now() - 5 * minute),
        });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: "rewritten after the grade" },
          submittedAt: new Date(Date.now() - minute),
        });
        await insertSubmission(db, { testId, studentId });
        return { courseId, testId };
      });

      await page.goto(route.path(ids));
      const panel = page.getByTestId("grade-card");
      await hydrated(panel.getByRole("button", { name: /^Save & next/ }));
      await expect(panel.getByLabel("Feedback:", { exact: true })).toBeHidden();
      await expect(
        panel.getByText("Answer changed after your grade"),
      ).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }

  test("a phone shows both grading pages, By student and By question, without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const ids = await seedTabletTest();
    for (const view of tabletRoutes.flatMap((route) =>
      pivots.map((pivot) => ({ route, pivot })),
    )) {
      await page.goto(
        `${view.route.path(ids)}?studentId=${ids.ann}&questionId=${ids.questionId}${view.pivot.query}`,
      );
      await hydrated(
        page.getByTestId("grade-card").getByRole("button", {
          name: /^Save & next/,
        }),
      );
      await expectNoPageOverflow(page);
      await expect(
        page.getByTestId("grade-card").getByLabel("Score (0–100):"),
      ).toBeVisible();
    }
  });
});
