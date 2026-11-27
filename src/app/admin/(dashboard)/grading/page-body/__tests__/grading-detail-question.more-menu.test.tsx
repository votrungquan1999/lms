// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailQuestion } from "../grading-detail-question";

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

/** Renders By question for a graded student whose grade is still hidden from her. */
async function renderGradedHiddenStudent() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const created = await services.testService.createTest(course.id, {
    title: "Fractions Test",
    description: "",
    createdBy: "admin",
    showGradeAfterSubmit: false,
  });
  const q1 = await services.questionService.addQuestion(created.id, {
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
    testId: created.id,
    questionId: q1.id,
    studentId: student.id,
    answer: { type: "free_text", text: "answer 1" },
  });
  await services.testSubmissionService.submitTest(created.id, student.id);
  await services.gradeService.gradeQuestion({
    testId: created.id,
    questionId: q1.id,
    studentId: student.id,
    score: 70,
    feedback: "ok",
    gradedBy: "admin",
  });

  const test = await services.testService.requireTest(created.id);
  // Loaded here so it reads the mocked services singleton.
  const { readGradingScreen } = await import("src/lib/grading-screen-read");
  const ui = await GradingDetailQuestion({
    test,
    courseId: course.id,
    schoolId: TEST_SCHOOL_ID,
    question: q1,
    student: { id: student.id, name: student.name, username: student.username },
    basePath: `/admin/grading/${test.id}`,
    screen: await readGradingScreen(TEST_SCHOOL_ID, test),
  });
  render(ui);
}

describe("Feature: By question's More menu for a graded student", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("offers Release to <student> and no AI entries", async () => {
    await renderGradedHiddenStudent();

    await userEvent.click(screen.getByRole("button", { name: /more/i }));

    expect(
      await screen.findByRole("menuitem", { name: /release to stu/i }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("menuitem", { name: /auto-grade with ai/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: /regenerate all/i }),
    ).toBeNull();
  });

  it("offers Request redo…, which opens the confirm dialog for her", async () => {
    await renderGradedHiddenStudent();

    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /request redo…/i }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Ask Stu to redo Fractions Test?",
      }),
    ).toBeInTheDocument();
  });
});
