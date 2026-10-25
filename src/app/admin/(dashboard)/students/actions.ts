"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ADMIN_ACCOUNT_CANNOT_BE_STUDENT } from "src/lib/account-kind-refusals";
import { getAuthService } from "src/lib/auth-singleton";
import {
  assertExpectedSchool,
  EXPECTED_SCHOOL_FIELD,
} from "src/lib/expected-school";
import { withSpan } from "src/lib/observability/with-span";
import {
  getSchoolDirectory,
  getSchoolService,
  getStudentService,
  getUserRoleService,
} from "src/lib/services-singleton";
import { Role } from "src/lib/session";
import { DuplicateUsernameError } from "src/lib/student-service";
import {
  ALREADY_IN_SCHOOL_MESSAGE,
  UNKNOWN_STUDENT_MESSAGE,
} from "./add-existing-student.types";
import { ADD_EXISTING_HINT } from "./bulk-import.types";

export interface CreateStudentState {
  success: boolean;
  message: string;
  fieldErrors?: { username?: string; password?: string };
  student?: {
    id: string;
    username: string;
    name: string;
  };
}

export interface AddExistingStudentState {
  success: boolean;
  message: string;
}

/**
 * Server action: adds an existing student, found by username in any school,
 * to the admin's school.
 */
export async function addExistingStudentAction(
  _prevState: AddExistingStudentState | null,
  formData: FormData,
): Promise<AddExistingStudentState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  // Defense-in-depth: verify admin session
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  // A stale tab still showing an older active school must not add here.
  const staleTab = assertExpectedSchool(
    formData.get(EXPECTED_SCHOOL_FIELD),
    schoolId,
  );
  if (staleTab) {
    return staleTab;
  }

  // Lowercased because usernames are stored lowercase
  const username =
    formData.get("username")?.toString().trim().toLowerCase() ?? "";

  return withSpan(
    "action.addExistingStudentAction",
    { "lms.action.name": "addExistingStudentAction" },
    async () => {
      const student = await (await getSchoolDirectory()).findByUsername(
        username,
      );
      if (!student) {
        return { success: false, message: UNKNOWN_STUDENT_MESSAGE };
      }

      if (student.schoolIds.includes(schoolId)) {
        return { success: false, message: ALREADY_IN_SCHOOL_MESSAGE };
      }

      // No account is both a student and an admin; refuse before any write.
      const authUserId = await (
        await getSchoolDirectory()
      ).findAuthUserIdByStudentId(student.id);
      if (authUserId) {
        const [account] = await (await getUserRoleService()).findUsersByIds([
          authUserId,
        ]);
        // A membership counts even for a deleted school, so the check fails closed.
        const isAdminAccount =
          account?.role === Role.Admin ||
          (await (await getSchoolService()).hasAnyMembership(authUserId));
        if (isAdminAccount) {
          console.warn("action.addExistingStudentAction.refused", {
            "lms.reason": "is-admin-account",
            "lms.user.id": authUserId,
          });
          return { success: false, message: ADMIN_ACCOUNT_CANNOT_BE_STUDENT };
        }
      }

      const studentService = await getStudentService(schoolId);
      // A student deleted since the lookup is reported as unknown
      if (!(await studentService.addToSchool(student.id))) {
        return { success: false, message: UNKNOWN_STUDENT_MESSAGE };
      }
      revalidatePath("/admin/students");
      return {
        success: true,
        message: `Added "${student.name}" (${student.username}) to your school`,
      };
    },
  );
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
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
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

  const name = formData.get("name")?.toString().trim() ?? "";
  // Lowercased here too — `registerStudent` lowercases internally, but doing
  // it at the boundary keeps this path's stored/displayed username in sync
  // with what self-signup produces for the same input (D45).
  const username =
    formData.get("username")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!name || !username || !password) {
    return { success: false, message: "All fields are required" };
  }

  if (password.length < 8) {
    const message = "Password must be at least 8 characters";
    return { success: false, message, fieldErrors: { password: message } };
  }

  try {
    return await withSpan(
      "action.createStudentAction",
      { "lms.action.name": "createStudentAction" },
      async () => {
        const student = await authService.registerStudent({
          name,
          username,
          password,
          createdBy: "admin",
          schoolId,
        });
        revalidatePath("/admin/students");
        return {
          success: true,
          message: `Student "${student.name}" created successfully`,
          student: {
            id: student.id,
            username: student.username,
            name: student.name,
          },
        };
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create student";
    let fieldErrors: CreateStudentState["fieldErrors"];
    if (error instanceof DuplicateUsernameError) {
      fieldErrors = { username: `${message}. ${ADD_EXISTING_HINT}` };
    } else if (message === "Password cannot be only spaces") {
      fieldErrors = { password: message };
    }
    return { success: false, message, fieldErrors };
  }
}
