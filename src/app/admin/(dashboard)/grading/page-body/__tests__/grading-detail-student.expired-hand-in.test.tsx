// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Db } from "mongodb";
import type { SingleSelectQuestion } from "src/lib/question-service";
import type { TestStartDocument } from "src/lib/test-start-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailStudent } from "../grading-detail-student";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

let db: Db;

describe("Feature: the grading view hands in an attempt whose time ran out", () => {
  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the auto-grade of the hand-in on the teacher's first render", async () => {
    // Given a 30-minute test with one MC question the student answered correctly
    const s = getTestServices();
    const course = await s.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await s.testService.createTest(course.id, {
      title: "Timed",
      description: "",
      createdBy: "admin",
    });
    await s.testService.updateTestSettings(test.id, {
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
      timeLimitMinutes: 30,
      isPractice: false,
      answerRevealMode: "diff",
      updatedBy: "admin",
    });
    const question = (await s.questionService.addQuestion(test.id, {
      title: "Q?",
      content: "Choose.",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "A", isCorrect: false },
        { text: "B", isCorrect: true },
      ],
    })) as SingleSelectQuestion;
    const student = await s.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "stu",
      name: "Stu",
      createdBy: "admin",
    });
    await s.enrollmentService.enrollStudent(course.id, student.id, "admin");
    await s.testStartService.recordStart(test.id, student.id, new Date());
    await s.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: {
        type: "mc",
        selectedIds: [question.options.find((o) => o.isCorrect)?.id ?? ""],
      },
    });

    // And the start lies two hours back, with no hand-in
    await db
      .collection<TestStartDocument>("test_start")
      .updateOne(
        { testId: test.id, studentId: student.id },
        { $set: { startedAt: new Date(Date.now() - 2 * 60 * 60_000) } },
      );

    // When the teacher opens the student's grading view
    const ui = await GradingDetailStudent({
      test,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      basePath: `/admin/grading/${test.id}`,
    });
    render(ui);

    // Then this very render counts the auto-grade written by the hand-in
    expect(screen.getByText("1/1 graded")).toBeInTheDocument();
  });
});
