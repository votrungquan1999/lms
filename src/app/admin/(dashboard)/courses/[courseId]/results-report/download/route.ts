import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { ResultsReportAssembler } from "src/lib/results-report-assembler";
import { renderResultsReportToBuffer } from "src/lib/results-report-pdf";
import {
  getAnswerService,
  getEnrollmentService,
  getGradeService,
  getQuestionService,
  getStudentService,
  getTestFeedbackService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";

/**
 * GET handler for the per-student results-report PDF download. Admin-only.
 * Reads a `studentId` and the repeated `testId` query params, assembles that
 * student's report across exactly those tests, and returns it as a PDF
 * attachment.
 * @param request - The incoming request (carries the query string).
 * @param context - Route context with the async `courseId` path param.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId");
  const testIds = url.searchParams.getAll("testId");
  if (!studentId || testIds.length === 0) {
    return new Response("Missing studentId or test selection", { status: 400 });
  }

  // Scope the report to this course: the student must be enrolled here.
  const { courseId } = await context.params;
  const enrollmentService = await getEnrollmentService();
  if (!(await enrollmentService.isEnrolled(courseId, studentId))) {
    return new Response("Student is not enrolled in this course", {
      status: 403,
    });
  }

  const [
    studentService,
    testService,
    questionService,
    answerService,
    gradeService,
    testStatusService,
    testFeedbackService,
  ] = await Promise.all([
    getStudentService(),
    getTestService(),
    getQuestionService(),
    getAnswerService(),
    getGradeService(),
    getTestStatusService(),
    getTestFeedbackService(),
  ]);

  // Every selected test must belong to this course (the route is directly
  // reachable, so a cross-course testId could otherwise be exported).
  for (const testId of testIds) {
    const test = await testService.getTest(testId);
    if (!test || test.courseId !== courseId) {
      return new Response("Selected test is not part of this course", {
        status: 404,
      });
    }
  }

  const assembler = new ResultsReportAssembler(
    studentService,
    testService,
    questionService,
    answerService,
    gradeService,
    testStatusService,
    testFeedbackService,
  );
  const model = await assembler.buildReport(studentId, testIds);
  const pdf = await renderResultsReportToBuffer(model);

  // Wrap the Node Buffer as a Uint8Array so it satisfies the Web `BodyInit` type.
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="results-report-${studentId}.pdf"`,
    },
  });
}
