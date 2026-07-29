// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

/**
 * Renders the admin grading detail for a single-question test that the student
 * has answered and whole-test submitted, so the status resolves to Submitted.
 * `isPractice` toggles the two grading footguns under test.
 */
async function renderGradingDetail(isPractice: boolean) {
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
    isPractice,
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
  await services.answerService.submitAnswer({
    testId: testDoc.id,
    questionId: q1.id,
    studentId: student.id,
    answer: { type: "free_text", text: "answer 1" },
  });
  await services.testSubmissionService.submitTest(testDoc.id, student.id);

  const ui = await GradingDetailStudent({
    test: testDoc,
    courseId: course.id,
    student: {
      id: student.id,
      name: student.name,
      username: student.username,
    },
    basePath: "/admin/grading/test-1",
  });
  render(ui);
}

describe("Feature: practice tests suppress the grading footguns (AI-grade + redo)", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("hides the Auto-grade with AI button for a submitted practice test (a click would create Grade docs on a test required to have none)", async () => {
    await renderGradingDetail(true);

    expect(
      screen.queryByRole("button", { name: /auto-grade with ai/i }),
    ).toBeNull();
  });

  it("hides the Request Redo button for a practice test (redo reopens a graded test — practice has no grades to redo against)", async () => {
    await renderGradingDetail(true);

    expect(screen.queryByRole("button", { name: /request redo/i })).toBeNull();
  });

  it("shows both grading controls for a non-practice submitted test (proves the practice gate is conditional, not an unconditional hide)", async () => {
    await renderGradingDetail(false);

    expect(
      screen.getByRole("button", { name: /auto-grade with ai/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /request redo/i }),
    ).toBeInTheDocument();
  });
});
