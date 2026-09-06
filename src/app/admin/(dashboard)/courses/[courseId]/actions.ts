"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getCourseService,
  getEnrollmentService,
  getTestService,
} from "src/lib/services-singleton";
import { z } from "zod";

const setEnrollmentsSchema = z.object({
  courseId: z.string().min(1, "Course ID is missing"),
  studentIds: z.array(z.string()),
  observedStudentIds: z.array(z.string()),
});

export interface SetEnrollmentsState {
  success: boolean;
  message: string;
}

/**
 * Server action: sets the enrolled students for a course (idempotent).
 * Enrolls new students and removes only those the admin's dialog actually
 * observed and unticked — an enrollment made after the dialog opened is
 * never touched (BUG-2).
 */
export async function setEnrollmentsAction(
  _prevState: SetEnrollmentsState | null,
  formData: FormData,
): Promise<SetEnrollmentsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = setEnrollmentsSchema.safeParse({
    courseId: formData.get("courseId"),
    studentIds: formData.getAll("studentIds"),
    observedStudentIds: formData.getAll("observedStudentIds"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.setEnrollmentsAction",
      {
        "lms.action.name": "setEnrollmentsAction",
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const enrollmentService = await getEnrollmentService();
        await enrollmentService.setEnrolledStudents(parsed.data.courseId, {
          desired: parsed.data.studentIds,
          observed: parsed.data.observedStudentIds,
          updatedBy: adminUserId,
        });

        revalidatePath(`/admin/courses/${parsed.data.courseId}`);
        return {
          success: true,
          message: `Enrollments updated (${parsed.data.studentIds.length} student${parsed.data.studentIds.length !== 1 ? "s" : ""})`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to update enrollments";
    return { success: false, message };
  }
}

const inviteLinkCourseSchema = z.object({
  courseId: z.string().min(1, "Course ID is missing"),
});

export interface InviteLinkState {
  success: boolean;
  message: string;
}

/**
 * Server action: returns the course's join-link token, minting one on first
 * request. Never logs or spans the token itself — it is a secret, and
 * withSpan attributes are IDs/enums only.
 */
export async function getInviteLinkAction(
  _prevState: InviteLinkState | null,
  formData: FormData,
): Promise<InviteLinkState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return {
      success: false,
      message: "Unauthorized: admin access required",
    };
  }

  const parsed = inviteLinkCourseSchema.safeParse({
    courseId: formData.get("courseId"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    return await withSpan(
      "action.getInviteLinkAction",
      {
        "lms.action.name": "getInviteLinkAction",
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const courseService = await getCourseService();
        await courseService.getOrCreateInviteToken(parsed.data.courseId);
        revalidatePath(`/admin/courses/${parsed.data.courseId}`);
        return { success: true, message: "Join link ready" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to get join link";
    return { success: false, message };
  }
}

/**
 * Server action: issues a fresh join-link token for the course, replacing
 * any existing one — the previous link stops resolving. Never logs or spans
 * the token itself.
 */
export async function regenerateInviteLinkAction(
  _prevState: InviteLinkState | null,
  formData: FormData,
): Promise<InviteLinkState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return {
      success: false,
      message: "Unauthorized: admin access required",
    };
  }

  const parsed = inviteLinkCourseSchema.safeParse({
    courseId: formData.get("courseId"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    return await withSpan(
      "action.regenerateInviteLinkAction",
      {
        "lms.action.name": "regenerateInviteLinkAction",
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const courseService = await getCourseService();
        await courseService.regenerateInviteToken(parsed.data.courseId);
        revalidatePath(`/admin/courses/${parsed.data.courseId}`);
        return { success: true, message: "New join link issued" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to issue new join link";
    return { success: false, message };
  }
}

/**
 * Server action: switches a course's join link off entirely — nobody can
 * use it any more. Never logs or spans the token itself.
 */
export async function disableInviteLinkAction(
  _prevState: InviteLinkState | null,
  formData: FormData,
): Promise<InviteLinkState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return {
      success: false,
      message: "Unauthorized: admin access required",
    };
  }

  const parsed = inviteLinkCourseSchema.safeParse({
    courseId: formData.get("courseId"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    return await withSpan(
      "action.disableInviteLinkAction",
      {
        "lms.action.name": "disableInviteLinkAction",
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const courseService = await getCourseService();
        await courseService.disableInviteToken(parsed.data.courseId);
        revalidatePath(`/admin/courses/${parsed.data.courseId}`);
        return { success: true, message: "Join link turned off" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to turn off join link";
    return { success: false, message };
  }
}

const createTestSchema = z.object({
  courseId: z.string().min(1, "Course ID is missing"),
  title: z.string().trim().min(1, "Test title is required"),
  description: z.string().trim().default(""),
  // Checkbox sends "true" when checked, nothing when unchecked
  showGradeAfterSubmit: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export interface CreateTestState {
  success: boolean;
  message: string;
}

/**
 * Server action: creates a new test in a course.
 */
export async function createTestAction(
  _prevState: CreateTestState | null,
  formData: FormData,
): Promise<CreateTestState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = createTestSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    description: formData.get("description"),
    showGradeAfterSubmit: formData.get("showGradeAfterSubmit") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.createTestAction",
      {
        "lms.action.name": "createTestAction",
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const testService = await getTestService();
        const test = await testService.createTest(parsed.data.courseId, {
          title: parsed.data.title,
          description: parsed.data.description,
          createdBy: adminUserId,
          showGradeAfterSubmit: parsed.data.showGradeAfterSubmit,
        });

        revalidatePath(`/admin/courses/${parsed.data.courseId}`);
        return {
          success: true,
          message: `Test "${test.title}" created successfully`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create test";
    return { success: false, message };
  }
}
