"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACTIVE_SCHOOL_COOKIE_NAME,
  activeSchoolCookieOptions,
} from "src/lib/active-school-cookie";
import { getAuthService } from "src/lib/auth-singleton";
import { getSchoolDirectory } from "src/lib/services-singleton";

/**
 * Server action: switches the signed-in student's active school. Always
 * re-verifies against the student's own schools — the submitted school id is
 * never trusted on its own, since a stale tab or a tampered form could name
 * any school. `redirect()` stays outside any try/catch: it throws
 * `NEXT_REDIRECT`, and the current page's ids belong to the OLD school.
 * @param formData - Carries the target `schoolId`.
 */
export async function switchSchoolAction(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  const session = await authService.requireStudentSession(requestHeaders);

  const schoolId = String(formData.get("schoolId") ?? "");
  const schoolDirectory = await getSchoolDirectory();
  const student = await schoolDirectory.findByAuthUserId(session.userId);
  if (!student?.schoolIds.includes(schoolId)) {
    throw new Error("You do not belong to that school");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_SCHOOL_COOKIE_NAME,
    schoolId,
    activeSchoolCookieOptions,
  );

  redirect("/student/dashboard");
}
