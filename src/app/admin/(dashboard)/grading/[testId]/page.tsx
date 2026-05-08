import { notFound } from "next/navigation";
import { ReleaseGradesButton } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { GradingPageBody } from "src/app/admin/(dashboard)/grading/grading-page-body";
import {
  getCourseService,
  getEnrollmentService,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";

export const metadata = {
  title: "Grade Test — LMS Admin",
  description: "Grade student submissions",
};

/**
 * Variant grading page reachable from the grading hub. Renders the same body
 * as the course-scoped page but resolves courseId from the test (URL doesn't
 * include it) and shows the course name in the header.
 */
export default async function GradingVariantPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  if (!test) {
    notFound();
  }

  const courseId = test.courseId;
  const courseService = await getCourseService();
  const course = await courseService.getCourse(courseId);

  const enrollmentService = await getEnrollmentService();
  const studentIds = await enrollmentService.listEnrollmentsByCourse(courseId);

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const body = await GradingPageBody({ test, courseId });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Grade: {test.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {course?.title ?? "Course"} · {studentIds.length} student(s) ·{" "}
          {questions.length} question(s)
        </p>
        {!test.showGradeAfterSubmit && !test.gradesReleasedAt && (
          <div className="mt-4">
            <ReleaseGradesButton testId={testId} courseId={courseId} />
          </div>
        )}
      </header>

      {body}
    </div>
  );
}
