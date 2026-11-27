// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** Renders a graded, handed-in student's grading detail and returns what the test needs to look her up. */
async function renderGradedStudent() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const testDoc = await services.testService.createTest(course.id, {
    title: "Fractions Test",
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
  return { testId: testDoc.id, studentId: student.id, services };
}

describe("Feature: requesting a redo from More", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("asks for confirmation first and requests the redo only when confirmed", async () => {
    const user = userEvent.setup();
    const { testId, studentId, services } = await renderGradedStudent();

    await user.click(screen.getByRole("button", { name: /more/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /request redo…/i }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Ask Stu to redo Fractions Test?",
    });
    expect(
      await services.redoRequestService.getActiveRedoRequest(testId, studentId),
    ).toBeNull();

    // Cancel leaves her alone
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      await services.redoRequestService.getActiveRedoRequest(testId, studentId),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: /more/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /request redo…/i }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Request redo",
      }),
    );

    await waitFor(async () => {
      expect(
        await services.redoRequestService.getActiveRedoRequest(
          testId,
          studentId,
        ),
      ).not.toBeNull();
    });
  });
});
