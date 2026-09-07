import { revalidatePath } from "next/cache";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import { approveJoinRequestAction } from "../actions";

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: Approve a course join request
 * As an admin
 * I want approving a waiting request to enroll the student
 * So that the queue action is the moment a waiting student actually gets
 * into the course
 */
describe("Feature: Approve a course join request", () => {
  it("enrolls the student in the course and marks the request approved", async () => {
    const {
      courseService,
      studentService,
      courseJoinRequestService,
      enrollmentService,
    } = getTestServices();

    // Given a pending join request
    const course = await courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    const student = await studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "student-1",
      name: "Student One",
      createdBy: "self-signup",
    });
    const request = await courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });

    const formData = new FormData();
    formData.set("requestId", request.id);

    // When an admin approves it
    const state = await approveJoinRequestAction(null, formData);

    // Then the student is enrolled and the request is marked approved
    expect(state.success).toBe(true);
    expect(await enrollmentService.isEnrolled(course.id, student.id)).toBe(
      true,
    );
    const updated = await courseJoinRequestService.getRequest(request.id);
    expect(updated?.status).toBe(JoinRequestStatus.Approved);
    // Audit trail: who resolved it and when (D11)
    expect(updated?.resolvedAt).toBeInstanceOf(Date);
    expect(updated?.resolvedBy).toBe("admin-1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/join-requests");
  });

  it("refuses a non-admin caller and enrolls no one", async () => {
    const {
      courseService,
      studentService,
      courseJoinRequestService,
      enrollmentService,
    } = getTestServices();

    // Given a pending join request
    const course = await courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    const student = await studentService.createStudentDocument({
      authUserId: "auth-2",
      username: "student-2",
      name: "Student Two",
      createdBy: "self-signup",
    });
    const request = await courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });

    const formData = new FormData();
    formData.set("requestId", request.id);

    // When a non-admin (or unauthenticated) caller tries to approve it —
    // requireAdminSession throws identically for both cases (auth-service.ts)
    requireAdminSession.mockRejectedValueOnce(new Error("not admin"));
    const state = await approveJoinRequestAction(null, formData);

    // Then it is refused, and nothing about the request or course changed
    expect(state.success).toBe(false);
    expect(await enrollmentService.isEnrolled(course.id, student.id)).toBe(
      false,
    );
    const unchanged = await courseJoinRequestService.getRequest(request.id);
    expect(unchanged?.status).toBe(JoinRequestStatus.Pending);
  });
});
