"use server";

import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";

export interface CreateStudentState {
  success: boolean;
  message: string;
  student?: {
    id: string;
    username: string;
    name: string;
  };
}

/**
 * Server action: creates a student account.
 * Validates admin session, then delegates to AuthService.
 */
export async function createStudentAction(
  _prevState: CreateStudentState | null,
  formData: FormData,
): Promise<CreateStudentState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  // Defense-in-depth: verify admin session
  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!name || !username || !password) {
    return { success: false, message: "All fields are required" };
  }

  if (password.length < 8) {
    return {
      success: false,
      message: "Password must be at least 8 characters",
    };
  }

  try {
    const student = await authService.createStudent({
      name,
      username,
      password,
    });
    return {
      success: true,
      message: `Student "${student.name}" created successfully`,
      student: {
        id: student.id,
        username: student.username,
        name: student.name,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create student";
    return { success: false, message };
  }
}
