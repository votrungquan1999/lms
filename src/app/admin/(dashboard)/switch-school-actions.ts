"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACTIVE_SCHOOL_COOKIE_NAME,
  activeSchoolCookieOptions,
} from "src/lib/active-school-cookie";
import { getAuthService } from "src/lib/auth-singleton";
import { getSchoolService } from "src/lib/services-singleton";

/**
 * Server action: switches the signed-in admin's active school. Always
 * re-verifies membership server-side — the submitted school id is never
 * trusted on its own, since a stale tab or a tampered form could name any
 * school. `redirect()` stays outside any try/catch (as in grading/actions.ts
 * :608-609): it throws `NEXT_REDIRECT`, and the current page's ids belong
 * to the OLD school, so staying on it after the switch would show the
 * wrong data.
 * @param formData - Carries the target `schoolId`.
 */
export async function switchSchoolAction(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  const session = await authService.requireAdminSession(requestHeaders);

  const schoolId = String(formData.get("schoolId") ?? "");
  const schoolService = await getSchoolService();
  const schools = await schoolService.listSchoolsForUser(session.userId);
  const isMember = schools.some((school) => school.id === schoolId);
  if (!isMember) {
    throw new Error("You do not belong to that school");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_SCHOOL_COOKIE_NAME,
    schoolId,
    activeSchoolCookieOptions,
  );

  redirect("/admin/dashboard");
}
