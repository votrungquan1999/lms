"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import {
  assertExpectedSchool,
  EXPECTED_SCHOOL_FIELD,
} from "src/lib/expected-school";
import { withSpan } from "src/lib/observability/with-span";
import { getCourseService } from "src/lib/services-singleton";
import { z } from "zod";

const createCourseSchema = z.object({
  title: z.string().trim().min(1, "Course title is required"),
  description: z.string().trim().default(""),
});

export interface CreateCourseState {
  success: boolean;
  message: string;
  fieldErrors?: { title?: string };
}

/**
 * Server action: creates a new course.
 */
export async function createCourseAction(
  _prevState: CreateCourseState | null,
  formData: FormData,
): Promise<CreateCourseState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  // A stale tab still showing an older active school must not create here.
  const staleTab = assertExpectedSchool(
    formData.get(EXPECTED_SCHOOL_FIELD),
    schoolId,
  );
  if (staleTab) {
    return staleTab;
  }

  const parsed = createCourseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      message: issue.message,
      fieldErrors:
        issue.path[0] === "title" ? { title: issue.message } : undefined,
    };
  }

  try {
    return await withSpan(
      "action.createCourseAction",
      { "lms.action.name": "createCourseAction" },
      async () => {
        const courseService = await getCourseService(schoolId);
        const course = await courseService.createCourse({
          ...parsed.data,
          createdBy: adminUserId,
        });
        revalidatePath("/admin/courses");
        return {
          success: true,
          message: `Course "${course.title}" created successfully`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create course";
    return { success: false, message };
  }
}
