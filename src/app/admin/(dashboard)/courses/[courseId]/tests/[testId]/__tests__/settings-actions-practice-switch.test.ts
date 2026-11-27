import type { Db } from "mongodb";
import { TestStatus } from "src/lib/test-status-service";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestSettingsAction } from "../settings-actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

let db: Db;

beforeEach(async () => {
  ({ db } = await setupTestDb());
  requireAdminSession.mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** A practice test with two choice questions and one written one; Ann handed in with one right and one wrong choice answer. */
async function seedPracticeWithHandIn() {
  const s = getTestServices();
  const course = await s.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await s.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: "admin",
    isPractice: true,
  });
  const choice = (title: string) =>
    s.questionService.addQuestion(test.id, {
      type: "single_select",
      title,
      content: title,
      createdBy: "admin",
      options: [
        { text: "Right", isCorrect: true },
        { text: "Wrong", isCorrect: false },
      ],
    });
  const rightQuestion = await choice("Right one");
  const wrongQuestion = await choice("Wrong one");
  const writtenQuestion = await s.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Written",
    content: "Written",
    createdBy: "admin",
  });
  const ann = await s.studentService.createStudentDocument({
    authUserId: "auth-ann",
    username: "ann",
    name: "Ann",
    createdBy: "admin",
  });
  await s.enrollmentService.enrollStudent(course.id, ann.id, "admin");
  const optionId = (question: typeof rightQuestion, text: string) =>
    (question.type === "single_select" || question.type === "multi_select"
      ? question.options
      : []
    ).find((o) => o.text === text)?.id as string;
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: rightQuestion.id,
    studentId: ann.id,
    answer: { type: "mc", selectedIds: [optionId(rightQuestion, "Right")] },
  });
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: wrongQuestion.id,
    studentId: ann.id,
    answer: { type: "mc", selectedIds: [optionId(wrongQuestion, "Wrong")] },
  });
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: writtenQuestion.id,
    studentId: ann.id,
    answer: { type: "free_text", text: "My essay" },
  });
  await s.testSubmissionService.submitTest(test.id, ann.id);
  return { course, test, ann, rightQuestion, wrongQuestion, writtenQuestion };
}

function settingsForm(
  courseId: string,
  testId: string,
  isPractice: boolean,
): FormData {
  const form = new FormData();
  form.set("courseId", courseId);
  form.set("testId", testId);
  form.set("showGradeAfterSubmit", "true");
  form.set("showCorrectAnswerAfterSubmit", "true");
  form.set("timeLimitMinutes", "");
  form.set("isPractice", String(isPractice));
  form.set("answerRevealMode", "plain");
  return form;
}

describe("Feature: switching a practice test to a normal test marks its hand-ins' choice answers", () => {
  it("grades the choice answers of every hand-in and leaves the written answer for the teacher", async () => {
    // Given a practice test with a hand-in that has a right and a wrong choice answer and a written answer
    const seed = await seedPracticeWithHandIn();
    const { gradeService, testStatusService } = getTestServices();
    expect(await gradeService.getGrades(seed.test.id, seed.ann.id)).toEqual([]);

    // When the teacher switches the test to a normal test
    const result = await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, false),
    );

    // Then the choice answers carry their scores and the written answer still waits for a grade
    expect(result).toEqual({ success: true, message: "Settings saved" });
    const grades = await gradeService.getGrades(seed.test.id, seed.ann.id);
    expect(
      Object.fromEntries(grades.map((g) => [g.questionId, g.score])),
    ).toEqual({ [seed.rightQuestion.id]: 100, [seed.wrongQuestion.id]: 0 });
    expect(
      await testStatusService.getStatus(seed.test.id, seed.ann.id, 3),
    ).toBe(TestStatus.Submitted);
  });

  it("keeps a grade a choice answer already has and marks only the unmarked one", async () => {
    // Given a practice hand-in whose wrong choice answer the teacher already scored by hand
    const seed = await seedPracticeWithHandIn();
    const { gradeService } = getTestServices();
    await gradeService.gradeQuestion({
      testId: seed.test.id,
      questionId: seed.wrongQuestion.id,
      studentId: seed.ann.id,
      score: 50,
      feedback: "Half credit for the working",
      gradedBy: "admin-1",
    });

    // When the teacher switches the test to a normal test
    await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, false),
    );

    // Then the teacher's grade stays as she left it and the other choice answer is marked
    const grades = await gradeService.getGrades(seed.test.id, seed.ann.id);
    expect(
      Object.fromEntries(
        grades.map((g) => [g.questionId, [g.score, g.feedback]]),
      ),
    ).toEqual({
      [seed.rightQuestion.id]: [100, ""],
      [seed.wrongQuestion.id]: [50, "Half credit for the working"],
    });
  });

  it("re-marks a choice answer the student changed after its grade", async () => {
    // Given a hand-in whose wrong choice answer was marked 0 before she changed it to the right option
    const seed = await seedPracticeWithHandIn();
    const s = getTestServices();
    await s.gradeService.gradeQuestion({
      testId: seed.test.id,
      questionId: seed.wrongQuestion.id,
      studentId: seed.ann.id,
      score: 0,
      feedback: "",
      gradedBy: "system",
    });
    await db
      .collection("grade")
      .updateOne(
        { questionId: seed.wrongQuestion.id },
        { $set: { gradedAt: new Date("2026-01-01T00:00:00Z") } },
      );
    const right = (
      seed.wrongQuestion.type === "single_select"
        ? seed.wrongQuestion.options
        : []
    ).find((o) => o.isCorrect)?.id as string;
    await s.answerService.submitAnswer({
      testId: seed.test.id,
      questionId: seed.wrongQuestion.id,
      studentId: seed.ann.id,
      answer: { type: "mc", selectedIds: [right] },
    });

    // When the teacher switches the test to a normal test
    await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, false),
    );

    // Then the changed answer is marked from the answer key
    const grades = await s.gradeService.getGrades(seed.test.id, seed.ann.id);
    expect(
      Object.fromEntries(grades.map((g) => [g.questionId, g.score])),
    ).toEqual({ [seed.rightQuestion.id]: 100, [seed.wrongQuestion.id]: 100 });
  });

  it("writes no grades when a practice test is saved and stays practice", async () => {
    // Given a practice test with a hand-in
    const seed = await seedPracticeWithHandIn();
    const { gradeService } = getTestServices();

    // When the settings are saved with the test still practice
    await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, true),
    );

    // Then the hand-in stays unmarked
    expect(await gradeService.getGrades(seed.test.id, seed.ann.id)).toEqual([]);
  });

  it("stays practice when the marking fails, so saving again marks the hand-ins", async () => {
    // Given a practice test with a hand-in, and a marking run that fails once
    const seed = await seedPracticeWithHandIn();
    const s = getTestServices();
    const mark = vi
      .spyOn(s.testSubmissionService, "markChoiceAnswersForHandIns")
      .mockRejectedValueOnce(new Error("database went away"));

    // When the teacher switches it to a normal test and it fails
    const failed = await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, false),
    );

    // Then she is told, and the test is still practice
    expect(failed).toEqual({ success: false, message: "database went away" });
    expect((await s.testService.getTest(seed.test.id))?.isPractice).toBe(true);

    // When she saves again
    const retried = await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, false),
    );

    // Then the test is normal and the choice answers are marked
    mark.mockRestore();
    expect(retried).toEqual({ success: true, message: "Settings saved" });
    expect((await s.testService.getTest(seed.test.id))?.isPractice).toBe(false);
    const grades = await s.gradeService.getGrades(seed.test.id, seed.ann.id);
    expect(
      Object.fromEntries(grades.map((g) => [g.questionId, g.score])),
    ).toEqual({ [seed.rightQuestion.id]: 100, [seed.wrongQuestion.id]: 0 });
  });

  it("writes no grades when a normal test's settings are saved again", async () => {
    // Given a normal test with a hand-in whose choice answers have no grade
    const seed = await seedPracticeWithHandIn();
    const s = getTestServices();
    await s.testService.updateTestSettings(seed.test.id, {
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
      timeLimitMinutes: null,
      isPractice: false,
      answerRevealMode: "plain",
      updatedBy: "admin",
    });
    expect(await s.gradeService.getGrades(seed.test.id, seed.ann.id)).toEqual(
      [],
    );

    // When the settings are saved again with the test still normal
    await setTestSettingsAction(
      null,
      settingsForm(seed.course.id, seed.test.id, false),
    );

    // Then no marking runs
    expect(await s.gradeService.getGrades(seed.test.id, seed.ann.id)).toEqual(
      [],
    );
  });
});
