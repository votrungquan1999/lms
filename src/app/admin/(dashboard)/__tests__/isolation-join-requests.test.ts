import { JoinRequestStatus } from "src/lib/course-join-request-service";
import {
  addTestSchool,
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

import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "../join-requests/actions";

interface School {
  id: string;
  name: string;
}

/** Creates a pending join request in the DEFAULT school — foreign to School B. */
async function createForeignJoinRequest(): Promise<{
  requestId: string;
  courseId: string;
  studentId: string;
}> {
  const { courseService, studentService, courseJoinRequestService } =
    getTestServices();
  const course = await courseService.createCourse({
    title: "Foreign Course",
    description: "",
    createdBy: "default-school-admin",
  });
  const student = await studentService.createStudentDocument({
    authUserId: "auth-foreign-student",
    username: "foreign.student",
    name: "Foreign Student",
    createdBy: "self-signup",
  });
  const request = await courseJoinRequestService.createRequest({
    courseId: course.id,
    studentId: student.id,
  });
  return {
    requestId: request.id,
    courseId: course.id,
    studentId: student.id,
  };
}

/** Signs the harness's admin gate in as a NEW, non-default school's admin. */
async function signInAsOtherSchoolAdmin(): Promise<School> {
  const school = await addTestSchool("School B");
  requireAdminSession.mockResolvedValue({
    userId: "admin-b",
    role: "admin",
    school,
  });
  return school;
}

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: a school admin can never approve or reject another school's join
 * requests
 * As a school admin working in one school
 * I want a join-request id from another school to be refused
 * So that another school's waiting students can never be approved, rejected
 * or enrolled through mine
 */
describe("Feature: a school admin can never resolve another school's join requests", () => {
  it("approveJoinRequestAction refuses a foreign request and enrolls nobody", async () => {
    const { requestId, courseId, studentId } = await createForeignJoinRequest();
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("requestId", requestId);

    const result = await approveJoinRequestAction(null, formData);

    expect(result).toEqual({
      success: false,
      message: "Join request not found",
    });
    const { courseJoinRequestService, enrollmentService } = getTestServices();
    const unchanged = await courseJoinRequestService.getRequest(requestId);
    expect(unchanged?.status).toBe(JoinRequestStatus.Pending);
    expect(await enrollmentService.isEnrolled(courseId, studentId)).toBe(false);
  });

  it("rejectJoinRequestAction refuses a foreign request and leaves it waiting", async () => {
    const { requestId } = await createForeignJoinRequest();
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("requestId", requestId);

    const result = await rejectJoinRequestAction(null, formData);

    expect(result).toEqual({
      success: false,
      message: "Join request not found",
    });
    const { courseJoinRequestService } = getTestServices();
    const unchanged = await courseJoinRequestService.getRequest(requestId);
    expect(unchanged?.status).toBe(JoinRequestStatus.Pending);
  });

  it("re-approving an own request left approved but not enrolled finishes the enrollment", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const student = await own.studentService.createStudentDocument({
      authUserId: "auth-own-student",
      username: "own.student",
      name: "Own Student",
      createdBy: "self-signup",
    });
    const request = await own.courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });
    // An earlier approve claimed the status, then crashed before enrolling.
    await own.courseJoinRequestService.approve(request.id, "admin-b");
    const formData = new FormData();
    formData.set("requestId", request.id);

    const result = await approveJoinRequestAction(null, formData);

    expect(result.success).toBe(true);
    expect(await own.enrollmentService.isEnrolled(course.id, student.id)).toBe(
      true,
    );
  });
});
