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

describe("Feature: By student shows what the screen read once", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reads her status, answers, grades and redo from the screen's read, not again", async () => {
    // Given a handed-in written answer, and the screen's read of the test
    const s = getTestServices();
    const course = await s.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await s.testService.createTest(course.id, {
      title: "Essay",
      description: "",
      createdBy: "admin",
    });
    const question = await s.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q",
      content: "Write.",
      createdBy: "admin",
    });
    const student = await s.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "stu",
      name: "Stu",
      createdBy: "admin",
    });
    await s.enrollmentService.enrollStudent(course.id, student.id, "admin");
    await s.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "My essay" },
    });
    await s.testSubmissionService.submitTest(test.id, student.id);
    // Imported here: a top-level import reaches the services module before its mock is set up.
    const { readGradingScreen } = await import("src/lib/grading-screen-read");
    const screenRead = await readGradingScreen(TEST_SCHOOL_ID, test);
    const reads = [
      vi.spyOn(s.testStatusService, "getStatus"),
      vi.spyOn(s.answerService, "getLatestAnswers"),
      vi.spyOn(s.gradeService, "getGrades"),
      vi.spyOn(s.redoRequestService, "getActiveRedoRequest"),
    ];

    // When the teacher's By student view renders with that read
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
      routeKind: GradingRouteKind.Hub,
      screen: screenRead,
    });
    render(ui);

    // Then her answer and grade form show, and none of those four reads ran again
    expect(screen.getByText("My essay")).toBeVisible();
    expect(screen.getByLabelText("Score (0–100):")).toBeVisible();
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});
