import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "src/components/ui/breadcrumb";
import {
  getCourseService,
  getGradeService,
  getPageGuard,
  getQuestionService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { EmptyState } from "../../_ui/empty-state.ui";
import { PageHeader } from "../../_ui/page-header.ui";
import { TestRow } from "./test-row.ui";

export const metadata = {
  title: "Course — LMS",
  description: "View course tests",
};

/**
 * Course detail page: a header with course info and progress summary, plus the
 * list of tests with their status and score.
 */
export default async function StudentCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();
  await guard.requireEnrollment(courseId, session.studentId);

  const courseService = await getCourseService();
  const course = await courseService.getCourse(courseId);
  if (!course) {
    notFound();
  }

  const testService = await getTestService();
  const tests = await testService.listTests(courseId);

  const questionService = await getQuestionService();
  const testStatusService = await getTestStatusService();
  const gradeService = await getGradeService();

  // Compute status and score for each test
  const testsWithStatus = await Promise.all(
    tests.map(async (test) => {
      const questions = await questionService.listQuestions(test.id);
      const status = await testStatusService.getStatus(
        test.id,
        session.studentId,
        questions.length,
      );
      const averageScore =
        status === TestStatus.Graded
          ? await gradeService.getAverageScore(test.id, session.studentId)
          : null;
      return { ...test, status, questionCount: questions.length, averageScore };
    }),
  );

  const gradedCount = testsWithStatus.filter(
    (t) => t.status === TestStatus.Graded,
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/student/dashboard">My Courses</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{course.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={course.title}
        description={course.description}
      >
        {tests.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {gradedCount} of {tests.length} test
            {tests.length !== 1 ? "s" : ""} graded
          </p>
        )}
      </PageHeader>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tests</h2>

        {testsWithStatus.length > 0 ? (
          <div className="space-y-3">
            {testsWithStatus.map((test) => (
              <Link
                key={test.id}
                href={`/student/courses/${courseId}/tests/${test.id}`}
                className="block"
              >
                <TestRow
                  title={test.title}
                  questionCount={test.questionCount}
                  description={test.description}
                  status={test.status}
                  averageScore={test.averageScore}
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No tests yet"
            message="No tests available for this course yet."
          />
        )}
      </section>
    </div>
  );
}
