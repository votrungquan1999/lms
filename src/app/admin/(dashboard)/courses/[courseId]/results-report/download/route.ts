import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { ResultsReportAssembler } from "src/lib/results-report-assembler";
import { renderResultsReportToBuffer } from "src/lib/results-report-pdf";
import {
  getAnswerService,
  getCourseService,
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
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    schoolId = session.school.id;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId");
  const testIds = url.searchParams.getAll("testId");
  if (!studentId || testIds.length === 0) {
    return new Response("Missing studentId or test selection", { status: 400 });
  }

  const { courseId } = await context.params;
  const [
    courseService,
    enrollmentService,
    studentService,
    testService,
    questionService,
    answerService,
    gradeService,
    testStatusService,
    testFeedbackService,
  ] = await Promise.all([
    getCourseService(schoolId),
    getEnrollmentService(schoolId),
    getStudentService(schoolId),
    getTestService(schoolId),
    getQuestionService(schoolId),
    getAnswerService(schoolId),
    getGradeService(schoolId),
    getTestStatusService(schoolId),
    getTestFeedbackService(schoolId),
  ]);

  // School checks first, so another school's ids get the same 404 whether or
  // not an enrolment links them.
  if (!(await courseService.getCourse(courseId))) {
    return new Response("Course not found", { status: 404 });
  }
  const [student] = await studentService.findByIds([studentId]);
  if (!student) {
    return new Response("Student not found", { status: 404 });
  }

  // Scope the report to this course: the student must be enrolled here.
  if (!(await enrollmentService.isEnrolled(courseId, studentId))) {
    return new Response("Student is not enrolled in this course", {
      status: 403,
    });
  }

  // Every selected test must belong to this course (the route is directly
  // reachable, so a cross-course testId could otherwise be exported). A
  // foreign school's testId is caught the same way: the school-bound
  // getTest above already can't see it, so it never passes this check.
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
