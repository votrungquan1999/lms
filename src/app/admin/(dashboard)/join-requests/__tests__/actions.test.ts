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

import { approveJoinRequestAction, rejectJoinRequestAction } from "../actions";

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

  it("finishes an interrupted approval without enrolling the student twice", async () => {
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
      authUserId: "auth-6",
      username: "student-6",
      name: "Student Six",
      createdBy: "self-signup",
    });
    const request = await courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });

    // And the first approve attempt crashed after the enrollment write but
    // before the status write — the exact state a crash between the two
    // writes leaves behind, driven directly instead of killing a process
    await enrollmentService.enrollStudent(course.id, student.id, "admin-1");

    const formData = new FormData();
    formData.set("requestId", request.id);

    // When an admin approves the still-Pending request again
    const state = await approveJoinRequestAction(null, formData);

    // Then it converges: Approved, and still exactly one enrollment row
    expect(state.success).toBe(true);
    const updated = await courseJoinRequestService.getRequest(request.id);
    expect(updated?.status).toBe(JoinRequestStatus.Approved);
    const enrollments = (
      await enrollmentService.listEnrollmentsByStudent(student.id)
    ).filter((e) => e.courseId === course.id);
    expect(enrollments).toHaveLength(1);
  });
});

/**
 * Feature: Reject a course join request
 * As an admin
 * I want rejecting a waiting request to take it off the waiting list
 * So that the queue reflects the decision, without enrolling the student or
 * touching the account they created (D11/D66)
 */
describe("Feature: Reject a course join request", () => {
  it("marks the request rejected without enrolling the student, and the student's account still exists", async () => {
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
      authUserId: "auth-3",
      username: "student-3",
      name: "Student Three",
      createdBy: "self-signup",
    });
    const request = await courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });

    const formData = new FormData();
    formData.set("requestId", request.id);

    // When an admin rejects it
    const state = await rejectJoinRequestAction(null, formData);

    // Then the request is marked rejected, no enrollment is created, and the
    // student's account survives — rejection has no delete path (D11)
    expect(state.success).toBe(true);
    const updated = await courseJoinRequestService.getRequest(request.id);
    expect(updated?.status).toBe(JoinRequestStatus.Rejected);
    // Audit trail: who resolved it and when (D11)
    expect(updated?.resolvedAt).toBeInstanceOf(Date);
    expect(updated?.resolvedBy).toBe("admin-1");
    expect(await enrollmentService.isEnrolled(course.id, student.id)).toBe(
      false,
    );
    expect(await studentService.findByIds([student.id])).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/join-requests");
  });

  it("leaves an enrollment made through another path untouched (D66/R7)", async () => {
    const {
      courseService,
      studentService,
      courseJoinRequestService,
      enrollmentService,
    } = getTestServices();

    // Given a student already enrolled by another path (e.g. hand-added by
    // an admin) who ALSO has a stale pending request for the same course
    const course = await courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    const student = await studentService.createStudentDocument({
      authUserId: "auth-4",
      username: "student-4",
      name: "Student Four",
      createdBy: "self-signup",
    });
    await enrollmentService.enrollStudent(course.id, student.id, "admin-1");
    const request = await courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });

    const formData = new FormData();
    formData.set("requestId", request.id);

    // When an admin rejects the stale request
    const state = await rejectJoinRequestAction(null, formData);

    // Then the request is rejected, but the pre-existing enrollment survives
    // — a queue action must never silently revoke access granted elsewhere
    expect(state.success).toBe(true);
    const updated = await courseJoinRequestService.getRequest(request.id);
    expect(updated?.status).toBe(JoinRequestStatus.Rejected);
    expect(await enrollmentService.isEnrolled(course.id, student.id)).toBe(
      true,
    );
  });

  it("refuses a non-admin caller and changes nothing", async () => {
    const { courseService, studentService, courseJoinRequestService } =
      getTestServices();

    // Given a pending join request
    const course = await courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    const student = await studentService.createStudentDocument({
      authUserId: "auth-5",
      username: "student-5",
      name: "Student Five",
      createdBy: "self-signup",
    });
    const request = await courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });

    const formData = new FormData();
    formData.set("requestId", request.id);

    // When a non-admin (or unauthenticated) caller tries to reject it
    requireAdminSession.mockRejectedValueOnce(new Error("not admin"));
    const state = await rejectJoinRequestAction(null, formData);

    // Then it is refused, and the request is still waiting
    expect(state.success).toBe(false);
    const unchanged = await courseJoinRequestService.getRequest(request.id);
    expect(unchanged?.status).toBe(JoinRequestStatus.Pending);
  });
});
