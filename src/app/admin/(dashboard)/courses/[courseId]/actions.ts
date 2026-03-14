"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import {
  getEnrollmentService,
  getTestService,
} from "src/lib/services-singleton";
import { z } from "zod";

const setEnrollmentsSchema = z.object({
  courseId: z.string().min(1, "Course ID is missing"),
  studentIds: z.array(z.string()),
});

export interface SetEnrollmentsState {
  success: boolean;
  message: string;
}

/**
 * Server action: sets the enrolled students for a course (idempotent).
 * Replaces the current enrollment list with the provided student IDs.
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
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const enrollmentService = await getEnrollmentService();
    await enrollmentService.setEnrolledStudents(
      parsed.data.courseId,
      parsed.data.studentIds,
      adminUserId,
    );

    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return {
      success: true,
      message: `Enrollments updated (${parsed.data.studentIds.length} student${parsed.data.studentIds.length !== 1 ? "s" : ""})`,
    };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to update enrollments";
    return { success: false, message };
  }
}

const createTestSchema = z.object({
  courseId: z.string().min(1, "Course ID is missing"),
  title: z.string().trim().min(1, "Test title is required"),
  description: z.string().trim().default(""),
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
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const testService = await getTestService();
    const test = await testService.createTest(parsed.data.courseId, {
      title: parsed.data.title,
      description: parsed.data.description,
      createdBy: adminUserId,
    });

    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return {
      success: true,
      message: `Test "${test.title}" created successfully`,
    };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create test";
    return { success: false, message };
  }
}
