// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentDashboardPage from "../page";

const mockGetSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    getSession: (...args: unknown[]) => mockGetSession(...args),
  }),
}));

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: Student dashboard shows a pending join request
 * As a student waiting on admin approval to join a course
 * I want to be told my request is still pending
 * So that I know it wasn't lost, whether or not my course list is empty
 */
describe("Feature: Student dashboard shows a pending join request", () => {
  it("shows the pending notice even though the student is already enrolled in another course (R13)", async () => {
    const {
      courseService,
      studentService,
      enrollmentService,
      courseJoinRequestService,
    } = getTestServices();

    const student = await studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "student-1",
      name: "Student One",
      createdBy: "self-signup",
    });
    mockGetSession.mockResolvedValue({
      role: "student",
      userId: "auth-1",
      username: "student-1",
      studentId: student.id,
    });

    // Given the student is already enrolled in one course...
    const enrolledCourse = await courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    await enrollmentService.enrollStudent(
      enrolledCourse.id,
      student.id,
      "admin-1",
    );

    // ...and ALSO has a pending join request for a second course — the
    // course list is non-empty, so a notice hung off the empty state alone
    // would never fire here (R13)
    const otherCourse = await courseService.createCourse({
      title: "Geometry",
      description: "",
      createdBy: "admin-1",
    });
    await courseJoinRequestService.createRequest({
      courseId: otherCourse.id,
      studentId: student.id,
    });

    const ui = await StudentDashboardPage();
    render(ui);

    // Then the pending notice still appears
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });
});
