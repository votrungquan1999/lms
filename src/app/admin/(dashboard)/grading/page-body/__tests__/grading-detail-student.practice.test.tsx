// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
import { GradingDetailQuestion } from "../grading-detail-question";
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

/**
 * Renders the admin grading detail for a single-question test that the student
 * has answered and whole-test submitted, so the status resolves to Submitted.
 * `isPractice` toggles the practice gate, `mode` picks By student or By
 * question, and `answerKind` a written or a photo answer.
 */
async function renderGradingDetail(
  isPractice: boolean,
  mode: "student" | "question" = "student",
  answerKind: "text" | "image" = "text",
) {
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
  const q1 =
    answerKind === "image"
      ? await services.questionService.addQuestion(testDoc.id, {
          type: "image_answer",
          title: "Q1",
          content: "Q1",
          createdBy: "admin",
        })
      : await services.questionService.addQuestion(testDoc.id, {
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
    answer:
      answerKind === "image"
        ? { type: "image", mediaKeys: [`answers/${student.id}/p1.png`] }
        : { type: "free_text", text: "answer 1" },
  });
  await services.testSubmissionService.submitTest(testDoc.id, student.id);

  const studentRef = {
    id: student.id,
    name: student.name,
    username: student.username,
  };
  const ui =
    mode === "student"
      ? await GradingDetailStudent({
          screen: await (
            await import("src/lib/grading-screen-read")
          ).readGradingScreen(TEST_SCHOOL_ID, testDoc),
          test: testDoc,
          courseId: course.id,
          schoolId: TEST_SCHOOL_ID,
          student: studentRef,
          basePath: "/admin/grading/test-1",
          routeKind: GradingRouteKind.Hub,
        })
      : await GradingDetailQuestion({
          test: testDoc,
          courseId: course.id,
          schoolId: TEST_SCHOOL_ID,
          question: q1,
          student: studentRef,
          routeKind: GradingRouteKind.Hub,
          // Imported here: a top-level import reaches the services module before its mock is set up.
          screen: await (
            await import("src/lib/grading-screen-read")
          ).readGradingScreen(TEST_SCHOOL_ID, testDoc),
        });
  render(ui);
}

describe("Feature: a practice test shows answers only, with no grading controls", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the student's answer with no grade panel, More menu or Save & next on a submitted practice test", async () => {
    await renderGradingDetail(true);

    expect(screen.getByText("answer 1")).toBeInTheDocument();
    expect(screen.queryByTestId("grade-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /more/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save & next/i })).toBeNull();
  });

  it("shows the answer with no grade panel, More menu or Save & next in By question on a submitted practice test", async () => {
    await renderGradingDetail(true, "question");

    expect(screen.getByText("answer 1")).toBeInTheDocument();
    expect(screen.queryByTestId("grade-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /more/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save & next/i })).toBeNull();
  });

  it("shows a photo answer without mark tools on a practice test", async () => {
    await renderGradingDetail(true, "student", "image");

    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /draw in/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /save annotations/i }),
    ).toBeNull();
  });

  it("shows both grading controls for a non-practice submitted test (proves the practice gate is conditional, not an unconditional hide)", async () => {
    await renderGradingDetail(false);

    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(
      await screen.findByRole("menuitem", { name: /auto-grade with ai/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /request redo/i }),
    ).toBeInTheDocument();
  });
});
