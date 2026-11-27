import { headers } from "next/headers";
import type { ReleaseStudentCounts } from "src/app/admin/(dashboard)/grading/page-body/release-dialog.ui";
import {
  type ReleaseStudent,
  ReleaseStudentStatus,
  releaseStatusOfPair,
} from "src/app/admin/(dashboard)/grading/page-body/release-students";
import { getAuthService } from "src/lib/auth-singleton";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import {
  getQuestionService,
  getStudentService,
  getTestService,
} from "src/lib/services-singleton";

/**
 * GET handler for the release dialog's facts about one test. Admin-only and
 * read-only: it counts from the school's grading counts, which never write a
 * hand-in for an expired attempt. The proxy does not cover `/api/admin/*`, so
 * the session check here is the only gate.
 * @returns The dialog's students, counts and offers as JSON, 401 without a
 * school admin session, or 404 for a test that is missing or another school's.
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

  const pairs = school.pairs.filter((pair) => pair.testId === testId);
  const names = await (await getStudentService(schoolId)).findByIds(
    pairs.map((pair) => pair.studentId),
  );
  const students: ReleaseStudent[] = names
    .map((student) => ({
      id: student.id,
      name: student.name,
      username: student.username,
      status: releaseStatusOfPair(
        pairs.find((pair) => pair.studentId === student.id),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const inStatus = (...wanted: ReleaseStudentStatus[]) =>
    students.filter((s) => wanted.includes(s.status)).length;
  const counts: ReleaseStudentCounts = {
    graded: inStatus(
      ReleaseStudentStatus.Graded,
      ReleaseStudentStatus.Released,
    ),
    waiting: inStatus(ReleaseStudentStatus.Waiting),
    stillWriting: inStatus(ReleaseStudentStatus.StillWriting),
    redoRequested: inStatus(ReleaseStudentStatus.RedoRequested),
    notStarted: inStatus(ReleaseStudentStatus.NotStarted),
  };

  return Response.json(
    {
      counts,
      students,
      offerCorrectAnswers:
        !test.showCorrectAnswerAfterSubmit && !test.correctAnswersReleasedAt,
      choiceQuestionCount: questions.filter(
        (q) => q.type === "single_select" || q.type === "multi_select",
      ).length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
