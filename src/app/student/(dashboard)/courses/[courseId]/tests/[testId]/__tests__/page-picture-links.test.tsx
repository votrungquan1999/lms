// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MediaContentType } from "src/lib/question-service";
import { StudentSession } from "src/lib/session";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

const mockRequireStudentSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
  cookies: vi.fn(),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    requireStudentSession: (...args: unknown[]) =>
      mockRequireStudentSession(...args),
  }),
}));

/**
 * Configures the auth mock to return a student session for the given id.
 */
function mockStudentSession(studentId: string) {
  const session = new StudentSession({
    userId: `auth-${studentId}`,
    username: `u-${studentId}`,
    studentId,
    schoolId: TEST_SCHOOL_ID,
  });
  signInAs(session);
  mockRequireStudentSession.mockResolvedValue(session);
}

describe("Feature: Student test page shows picture links as Picture k", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a linked title, content and choices by their current picture number", async () => {
    // Given: a question whose text links picture B (the second of two)
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Linked test",
      description: "",
      createdBy: "admin-1",
    });
    const picture = (key: string, order: number) => ({
      key,
      contentType: MediaContentType.PNG,
      order,
      size: 1,
      fileName: `${order}.png`,
    });
    const link = (key: string) => `{{picture:${key}}}`;
    await services.questionService.addQuestion(test.id, {
      title: `Which is ${link("media/b.png")}?`,
      content: `Look at ${link("media/b.png")}`,
      createdBy: "admin-1",
      type: "single_select",
      options: [
        { text: link("media/a.png"), isCorrect: false },
        { text: link("media/b.png"), isCorrect: true },
      ],
      media: [picture("media/a.png", 0), picture("media/b.png", 1)],
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-stu",
      username: "stu",
      name: "Stu Dent",
      createdBy: "admin-1",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin-1",
    );

    // When: the student opens the test
    mockStudentSession(student.id);
    render(
      await StudentTestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // Then: every text reads Picture k, never the raw link
    expect(screen.getByText(/Which is Picture 2\?/)).toBeInTheDocument();
    expect(screen.getByText("Look at Picture 2")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Picture 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Picture 2" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{\{picture:/)).not.toBeInTheDocument();
  });
});
