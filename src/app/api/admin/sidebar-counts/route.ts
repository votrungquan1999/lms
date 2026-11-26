import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";

/**
 * GET handler for the sidebar's badge numbers. Admin-only and read-only: the
 * sidebar asks again on every page change because the layout itself does not
 * re-render on client navigation. The proxy does not cover `/api/admin/*`, so
 * this check is the only gate.
 * @returns The numbers as JSON, or 401 without a school admin session.
 */
export async function GET(): Promise<Response> {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    schoolId = session.school.id;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const gradingCounts = await getSchoolGradingCounts(schoolId);
  return Response.json(
    { toGrade: gradingCounts.waiting },
    { headers: { "Cache-Control": "no-store" } },
  );
}
