"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { getCourseService } from "src/lib/services-singleton";
import { z } from "zod";

const createCourseSchema = z.object({
  title: z.string().trim().min(1, "Course title is required"),
  description: z.string().trim().default(""),
});

export interface CreateCourseState {
  success: boolean;
  message: string;
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
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = createCourseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const courseService = await getCourseService();
    const course = await courseService.createCourse({
      ...parsed.data,
      createdBy: adminUserId,
    });
    revalidatePath("/admin/courses");
    return {
      success: true,
      message: `Course "${course.title}" created successfully`,
    };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create course";
    return { success: false, message };
  }
}
