// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

/** Renders a handed-in student's Q1 whose grade was saved before or after her last answer. */
async function renderGradedStudent(options: {
  answerChangedAfterGrade: boolean;
}) {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const testDoc = await services.testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy: "admin",
  });
  const q1 = await services.questionService.addQuestion(testDoc.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-1",
    username: "stu",
    name: "Stu",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );
  const answer = (text: string) =>
    services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text },
    });
  await answer("first try");
  await services.testSubmissionService.submitTest(testDoc.id, student.id);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await services.gradeService.gradeQuestion({
    testId: testDoc.id,
    questionId: q1.id,
    studentId: student.id,
    score: 70,
    feedback: "solid first try",
    gradedBy: "admin",
  });
  if (options.answerChangedAfterGrade) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await answer("rewritten answer");
  }

  const ui = await GradingDetailStudent({
    test: testDoc,
    courseId: course.id,
    schoolId: TEST_SCHOOL_ID,
    student: {
      id: student.id,
      name: student.name,
      username: student.username,
    },
    basePath: "/admin/grading/test-1",
  });
  render(ui);
}

describe("Feature: a grade panel for an answer changed after its grade", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("says the answer changed after the grade and pre-fills the old grade", async () => {
    await renderGradedStudent({ answerChangedAfterGrade: true });

    expect(
      screen.getByText("Answer changed after your grade"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Score (0–100):")).toHaveValue(70);
    expect(screen.getByDisplayValue("solid first try")).toBeInTheDocument();
  });

  it("shows no changed line when the grade is newer than the answer", async () => {
    await renderGradedStudent({ answerChangedAfterGrade: false });

    expect(screen.getByLabelText("Score (0–100):")).toHaveValue(70);
    expect(screen.queryByText("Answer changed after your grade")).toBeNull();
  });
});
