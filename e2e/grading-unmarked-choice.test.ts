import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  expectNoPageOverflow,
  insertAnswer,
  insertCourse,
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

const viewports = [
  { name: "desktop", size: { width: 1440, height: 900 } },
  { name: "tablet", size: { width: 834, height: 1194 } },
];

/** A normal test whose two hand-ins hold choice answers with no mark, as when students hand in during the switch from practice. */
async function seedUnmarkedHandIns() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId);
    const rightId = crypto.randomUUID();
    const wrongId = crypto.randomUUID();
    const questionId = await insertQuestion(db, testId, {
      title: "[unmarked] Capital",
      type: "single_select",
      options: [
        { id: rightId, text: "Right", isCorrect: true },
        { id: wrongId, text: "Wrong", isCorrect: false },
      ],
    });
    const ann = await insertStudent(db, { name: "Ann Unmarked" });
    const ben = await insertStudent(db, { name: "Ben Unmarked" });
    for (const [studentId, optionId] of [
      [ann, rightId],
      [ben, wrongId],
    ] as const) {
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "mc", selectedIds: [optionId] },
      });
      await insertSubmission(db, { testId, studentId });
    }
    return { courseId, testId, questionId, ann, ben };
  });
}

for (const viewport of viewports) {
  test.describe(`Marking choice answers on ${viewport.name}`, () => {
    test.use({ viewport: viewport.size });

    for (const route of routes) {
      test(`on ${route.name} the grade panel says the answer is not marked yet and the button marks every hand-in`, async ({
        page,
      }) => {
        const ids = await seedUnmarkedHandIns();
        await page.goto(
          `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.questionId}`,
        );
        const panel = page.getByTestId("grade-card");
        const mark = panel.getByRole("button", {
          name: "Mark multiple-choice answers",
        });
        await hydrated(mark);

        // The panel shows the note and button in place of a score, and the number box waits
        await expect(
          panel.getByText(
            "Not marked yet · automatic marking did not run for this answer",
          ),
        ).toBeVisible();
        await expect(
          panel.getByText(
            "Marks every unmarked multiple-choice answer in this test",
          ),
        ).toBeVisible();
        await expect(panel.getByText(/^Score:/)).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Q1 needs grading" }),
        ).toBeVisible();
        await expectNoPageOverflow(page);

        // One press marks both students' answers from the answer key
        await mark.click();
        await expect
          .poll(async () => {
            const grades = await withDb((db) =>
              db.collection("grade").find({ testId: ids.testId }).toArray(),
            );
            return Object.fromEntries(
              grades.map((grade) => [grade.studentId, grade.score]),
            );
          })
          .toEqual({ [ids.ann]: 100, [ids.ben]: 0 });

        // The panel now shows her real score and the box shows the result
        await expect(panel.getByText("Score: 100")).toBeVisible();
        await expect(
          panel.getByRole("button", { name: "Mark multiple-choice answers" }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Q1 correct" }),
        ).toBeVisible();
      });
    }
  });
}

/** A normal test with a written Q1 and a choice Q2 whose hand-in has no mark, so Q1 is the last written answer to grade. */
async function seedWrittenThenUnmarked() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId);
    const writtenId = await insertQuestion(db, testId, {
      title: "[unmarked] Written",
      order: 1,
    });
    const rightId = crypto.randomUUID();
    const choiceId = await insertQuestion(db, testId, {
      title: "[unmarked] Capital",
      order: 2,
      type: "single_select",
      options: [
        { id: rightId, text: "Right", isCorrect: true },
        { id: crypto.randomUUID(), text: "Wrong", isCorrect: false },
      ],
    });
    const ann = await insertStudent(db, { name: "Ann Unmarked" });
    await enroll(db, { courseId, studentId: ann });
    await insertAnswer(db, {
      testId,
      questionId: writtenId,
      studentId: ann,
      answer: { type: "free_text", text: "Ann's words" },
    });
    await insertAnswer(db, {
      testId,
      questionId: choiceId,
      studentId: ann,
      answer: { type: "mc", selectedIds: [rightId] },
    });
    await insertSubmission(db, { testId, studentId: ann });
    return { courseId, testId, writtenId, choiceId, ann };
  });
}

test.describe("Save & next reaches an unmarked choice answer", () => {
  test.use({ viewport: viewports[0].size });

  for (const route of routes) {
    test(`on ${route.name} grading the last written answer opens the choice question with its Mark button`, async ({
      page,
    }) => {
      const ids = await seedWrittenThenUnmarked();
      await page.goto(
        `${route.path(ids)}?studentId=${ids.ann}&questionId=${ids.writtenId}`,
      );
      const panel = page.getByTestId("grade-card");

      // The button names the choice question as the next stop
      const save = panel.getByRole("button", { name: "Save & next: Q2 ›" });
      await hydrated(save);
      await panel.getByLabel("Score (0–100):").fill("80");
      await save.click();

      // Q2 opens with the Mark button, and the finish panel stays away
      await expect(
        panel.getByRole("button", { name: "Mark multiple-choice answers" }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page).toHaveURL(new RegExp(`questionId=${ids.choiceId}`));
      await expect(page.getByText("Nothing else in this test")).toHaveCount(0);
      await expect(page.getByTestId("finish-panel")).toHaveCount(0);
    });
  }
});
