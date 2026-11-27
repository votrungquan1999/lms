import { headers } from "next/headers";
import type { ReleaseStudentCounts } from "src/app/admin/(dashboard)/grading/page-body/release-dialog.ui";
import { getAuthService } from "src/lib/auth-singleton";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import { getQuestionService, getTestService } from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";

/**
 * GET handler for the release dialog's facts about one test. Admin-only and
 * read-only: it counts from the school's grading counts, which never write a
 * hand-in for an expired attempt. The proxy does not cover `/api/admin/*`, so
 * the session check here is the only gate.
 * @returns The dialog's counts and offers as JSON, 401 without a school admin
 * session, or 404 for a test that is missing or another school's.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ testId: string }> },
): Promise<Response> {
  const { testId } = await params;
  const requestHeaders = await headers();
  const authService = await getAuthService();
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    schoolId = session.school.id;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const testService = await getTestService(schoolId);
  const test = await testService.getTest(testId);
  if (!test) return new Response("Test not found", { status: 404 });

  const [school, questions] = await Promise.all([
    getSchoolGradingCounts(schoolId),
    (await getQuestionService(schoolId)).listQuestions(testId),
  ]);

  const counts: ReleaseStudentCounts = {
    graded: 0,
    waiting: 0,
    stillWriting: 0,
    redoRequested: 0,
    notStarted: 0,
  };
  for (const pair of school.pairs) {
    if (pair.testId !== testId) continue;
    if (pair.redoRequested) counts.redoRequested++;
    else if (pair.status === TestStatus.Graded) counts.graded++;
    else if (pair.status === TestStatus.Submitted) counts.waiting++;
    else if (pair.status === TestStatus.InProgress) counts.stillWriting++;
    else counts.notStarted++;
  }

  return Response.json(
    {
      counts,
      offerCorrectAnswers:
        !test.showCorrectAnswerAfterSubmit && !test.correctAnswersReleasedAt,
      choiceQuestionCount: questions.filter(
        (q) => q.type === "single_select" || q.type === "multi_select",
      ).length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
