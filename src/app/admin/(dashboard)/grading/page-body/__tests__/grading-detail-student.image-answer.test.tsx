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

describe("Feature: per-student grading view renders image_answer submissions", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the submitted photo and a score form for an image_answer question (not 'No answer submitted')", async () => {
    // Given an image_answer question the student answered with a photo.
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
    const question = await services.questionService.addQuestion(testDoc.id, {
      type: "image_answer",
      title: "Handwritten Q",
      content: "Upload your work",
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
      questionId: question.id,
      studentId: student.id,
      answer: {
        type: "image",
        mediaKeys: [`answers/${student.id}/p1.png`],
      },
    });

    // When the per-student grading view renders (the default grading surface).
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

    // Then the student's photo renders and a score input is available to grade
    // it — the question is NOT misreported as unanswered.
    expect(screen.queryByText(/No answer submitted/i)).not.toBeInTheDocument();
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      `https://fake-s3.local/get/answers/${student.id}/p1.png`,
    );
    expect(
      screen.getByRole("spinbutton", { name: /score/i }),
    ).toBeInTheDocument();
  });
});
