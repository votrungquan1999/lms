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

describe("Feature: the per-student grading pill reflects the real status, not just answered/graded counts", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the finished (green) pill style for an all-blank Graded student, not the not-started grey", async () => {
    // Given a 1-question test the student submits having answered nothing.
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
      title: "Q1",
      content: "",
      createdBy: "admin",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-blank",
      username: "blank-student",
      name: "Blank Student",
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
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then the pill reads the all-blank-Graded count, styled as done (green),
    // not the grey "nothing graded yet" style a 0/0 count would otherwise get.
    const pill = screen.getByText("0/0 graded · 1 blank");
    expect(pill.className).toContain("green");
    expect(pill.className).not.toContain("gray");
  });
});
