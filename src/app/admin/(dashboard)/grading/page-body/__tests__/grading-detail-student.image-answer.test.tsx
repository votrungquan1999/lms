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
      schoolId: TEST_SCHOOL_ID,
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
    const img = screen.getByRole("img", { name: "Student submitted work" });
    expect(img).toHaveAttribute(
      "src",
      `https://fake-s3.local/get/answers/${student.id}/p1.png`,
    );
    expect(
      screen.getByRole("spinbutton", { name: /score/i }),
    ).toBeInTheDocument();
  });

  it("shows 'No answer — counts as 0' and no score form for a blank image_answer question once the student has submitted", async () => {
    // Given an image_answer question the student never answered, submitted.
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
    await services.questionService.addQuestion(testDoc.id, {
      type: "image_answer",
      title: "Handwritten Q",
      content: "Upload your work",
      createdBy: "admin",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-2",
      username: "stu2",
      name: "Stu2",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    // Q1 deliberately left blank, then explicitly submitted.
    await services.testSubmissionService.submitTest(testDoc.id, student.id);

    // When the per-student grading view renders.
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

    // Then the blank reads "counts as 0" and no score form is offered.
    expect(screen.getByText("No answer — counts as 0")).toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: /score/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the saved marks read-only, with no marking tools, while a redo is open", async () => {
    // Given a graded photo answer with saved marks, and an open redo.
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
      authUserId: "auth-3",
      username: "stu3",
      name: "Stu3",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    const mediaKey = `answers/${student.id}/p1.png`;
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "image", mediaKeys: [mediaKey] },
    });
    await services.testSubmissionService.submitTest(testDoc.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: testDoc.id,
      questionId: question.id,
      studentId: student.id,
      score: 70,
      feedback: "ok",
      gradedBy: "admin",
    });
    await services.annotationService.saveAnnotations({
      testId: testDoc.id,
      questionId: question.id,
      studentId: student.id,
      gradedBy: "admin",
      annotations: [
        {
          mediaKey,
          strokes: [
            {
              color: "#ef4444",
              points: [
                { x: 0.1, y: 0.1 },
                { x: 0.5, y: 0.5 },
              ],
            },
          ],
          texts: [{ x: 0.3, y: 0.7, text: "look here", color: "#ef4444" }],
        },
      ],
    });
    await services.redoRequestService.requestRedo(
      testDoc.id,
      student.id,
      "admin",
    );

    // When the per-student grading view renders.
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
    const { container } = render(ui);

    // Then the photo shows its saved marks, but nothing can draw on it.
    expect(
      screen.getByRole("img", { name: "Student submitted work" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(screen.getByText("look here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pen" })).toBeNull();
    expect(screen.queryByLabelText("Drawing surface")).toBeNull();
  });
});
