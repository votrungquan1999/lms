// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { GradingMode } from "src/lib/grading-mode";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { setTestPractice } from "src/tests/seed-unmarked-choice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingPageShell } from "../grading-page-shell";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

/** A normal test with a written Q1 and a choice Q2; Ann handed in while it was practice, then Q1 was graded, so only her Q2 (no mark) waits. */
async function seedOnlyUnmarkedChoiceWaiting() {
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
  const q1 = await s.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const q2 = await s.questionService.addQuestion(test.id, {
    type: "single_select",
    title: "Q2",
    content: "Q2",
    createdBy: "admin",
    options: [
      { text: "Right", isCorrect: true },
      { text: "Wrong", isCorrect: false },
    ],
  });
  const ann = await s.studentService.createStudentDocument({
    authUserId: "auth-ann",
    username: "ann",
    name: "Ann",
    createdBy: "admin",
  });
  await s.enrollmentService.enrollStudent(course.id, ann.id, "admin");
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: q1.id,
    studentId: ann.id,
    answer: { type: "free_text", text: "Ann's words" },
  });
  const rightId = (q2.type === "single_select" ? q2.options : []).find(
    (o) => o.isCorrect,
  )?.id as string;
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: q2.id,
    studentId: ann.id,
    answer: { type: "mc", selectedIds: [rightId] },
  });
  await s.testSubmissionService.submitTest(test.id, ann.id);
  await setTestPractice(s, test.id, false);
  await s.gradeService.gradeQuestion({
    testId: test.id,
    questionId: q1.id,
    studentId: ann.id,
    score: 80,
    feedback: "",
    gradedBy: "admin",
  });
  return { course, test: await s.testService.requireTest(test.id) };
}

describe("Feature: opening a student whose only waiting work is an unmarked choice answer", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  for (const mode of [GradingMode.Student, GradingMode.Question]) {
    it(`${mode === GradingMode.Student ? "by student" : "by question"}: opens the choice question with its Mark button`, async () => {
      // Given Ann's Q1 is graded and her Q2 has no mark
      const { course, test } = await seedOnlyUnmarkedChoiceWaiting();

      // When the teacher opens the grading page with no question chosen
      const ui = await GradingPageShell({
        test,
        courseId: course.id,
        schoolId: TEST_SCHOOL_ID,
        routeKind: GradingRouteKind.Hub,
        selection: { mode },
      });
      render(ui);

      // Then Q2 is on screen with the Mark button
      expect(
        screen.getByRole("button", { name: "Mark multiple-choice answers" }),
      ).toBeEnabled();
    });
  }
});

describe("Feature: opening a student who is still writing", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("by student: opens her written answer, not her choice answer, which has no mark only because she has not handed in", async () => {
    // Given a normal test with a choice Q1 and a written Q2, and Ann still writing with both answered
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
    });
    const q1 = await s.questionService.addQuestion(test.id, {
      type: "single_select",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
      options: [
        { text: "Right", isCorrect: true },
        { text: "Wrong", isCorrect: false },
      ],
    });
    const q2 = await s.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q2",
      content: "Q2",
      createdBy: "admin",
    });
    const ann = await s.studentService.createStudentDocument({
      authUserId: "auth-ann",
      username: "ann",
      name: "Ann",
      createdBy: "admin",
    });
    await s.enrollmentService.enrollStudent(course.id, ann.id, "admin");
    await s.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: ann.id,
      answer: {
        type: "mc",
        selectedIds: [(q1.type === "single_select" ? q1.options : [])[0].id],
      },
    });
    await s.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: ann.id,
      answer: { type: "free_text", text: "Ann's words" },
    });

    // When the teacher opens her in By student with no question chosen
    const ui = await GradingPageShell({
      test: await s.testService.requireTest(test.id),
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      routeKind: GradingRouteKind.Hub,
      selection: { mode: GradingMode.Student, studentId: ann.id },
    });
    render(ui);

    // Then her written Q2 is on screen
    expect(screen.getByText("Ann's words")).toBeInTheDocument();
  });
});
