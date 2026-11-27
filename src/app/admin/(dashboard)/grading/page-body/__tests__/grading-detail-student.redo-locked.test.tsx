// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
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

/** Renders the grading detail for a student whose graded hand-in has an open redo request, with Q1 changed since its grade. */
async function renderRedoLockedStudent() {
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
  await services.answerService.submitAnswer({
    testId: testDoc.id,
    questionId: q1.id,
    studentId: student.id,
    answer: { type: "free_text", text: "answer 1" },
  });
  await services.testSubmissionService.submitTest(testDoc.id, student.id);
  await services.gradeService.gradeQuestion({
    testId: testDoc.id,
    questionId: q1.id,
    studentId: student.id,
    score: 70,
    feedback: "ok",
    gradedBy: "admin",
  });
  await services.redoRequestService.requestRedo(
    testDoc.id,
    student.id,
    "admin",
  );
  // She is part-way through the redo: Q1 is saved again after its grade.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await services.answerService.submitAnswer({
    testId: testDoc.id,
    questionId: q1.id,
    studentId: student.id,
    answer: { type: "free_text", text: "answer 2" },
  });

  const ui = await GradingDetailStudent({
    screen: await (
      await import("src/lib/grading-screen-read")
    ).readGradingScreen(TEST_SCHOOL_ID, testDoc),
    test: testDoc,
    courseId: course.id,
    schoolId: TEST_SCHOOL_ID,
    student: {
      id: student.id,
      name: student.name,
      username: student.username,
    },
    basePath: "/admin/grading/test-1",
    routeKind: GradingRouteKind.Hub,
  });
  render(ui);
}

describe("Feature: a student with an open redo is read-only", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows her answer with a note that grading opens again when she hands in, and no grade panel, More menu or Save & next", async () => {
    await renderRedoLockedStudent();

    expect(screen.getByText("answer 2")).toBeInTheDocument();
    // Her edit waits for the hand-in, so the box keeps its grade.
    expect(screen.getByRole("link", { name: "Q1 graded" })).toBeInTheDocument();
    expect(
      screen.getByText(/Grading opens again when Stu hands in/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save & next/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /more/i })).toBeNull();
  });
});
