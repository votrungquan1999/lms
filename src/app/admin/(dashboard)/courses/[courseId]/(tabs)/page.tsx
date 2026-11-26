import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getQuestionService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { DeleteTestButton } from "../tests/[testId]/delete-test-button";

export const metadata = {
  title: "Course Detail — LMS Admin",
  description: "Manage course enrollments and tests",
};

const statusLabels: Record<TestStatus, string> = {
  [TestStatus.NotStarted]: "Not Started",
  [TestStatus.InProgress]: "In Progress",
  [TestStatus.Submitted]: "Submitted",
  [TestStatus.Graded]: "Graded",
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);

  if (!course) {
    notFound();
  }

  const testService = await getTestService(session.school.id);
  const tests = await testService.listTests(courseId);

  const enrollmentService = await getEnrollmentService(session.school.id);
  const enrolledStudentIds =
    await enrollmentService.listEnrollmentsByCourse(courseId);

  const questionService = await getQuestionService(session.school.id);
  const testStatusService = await getTestStatusService(session.school.id);

  // Compute per-test status summary for enrolled students
  const testsWithSummary = await Promise.all(
    tests.map(async (test) => {
      const questions = await questionService.listQuestions(test.id);
      const statusCounts: Record<TestStatus, number> = {
        [TestStatus.NotStarted]: 0,
        [TestStatus.InProgress]: 0,
        [TestStatus.Submitted]: 0,
        [TestStatus.Graded]: 0,
      };

      for (const studentId of enrolledStudentIds) {
        const status = await testStatusService.getStatus(
          test.id,
          studentId,
          questions.length,
        );
        statusCounts[status]++;
      }

      return {
        ...test,
        statusCounts,
        totalStudents: enrolledStudentIds.length,
      };
    }),
  );

  return (
    <section className="w-full space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tests ({tests.length})</h2>
        </div>
        {testsWithSummary.length > 0 ? (
          testsWithSummary.map((test) => (
            <Card
              key={test.id}
              className="transition-colors hover:bg-accent/50 group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 block">
                    <div className="flex items-center justify-between gap-4 pointer-events-none">
                      <Link
                        href={`/admin/courses/${courseId}/tests/${test.id}`}
                        className="hover:underline pointer-events-auto"
                      >
                        <CardTitle className="text-lg">{test.title}</CardTitle>
                      </Link>
                      {test.totalStudents > 0 && (
                        <Link
                          href={`/admin/grading/${test.id}`}
                          className="shrink-0 whitespace-nowrap text-xs text-muted-foreground pointer-events-auto hover:underline"
                        >
                          {test.statusCounts[TestStatus.Graded]}/
                          {test.totalStudents} graded
                        </Link>
                      )}
                    </div>
                    <Link
                      href={`/admin/courses/${courseId}/tests/${test.id}`}
                      className="block pointer-events-auto"
                    >
                      {test.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {test.description}
                        </p>
                      )}
                      {test.totalStudents > 0 && (
                        <div className="flex gap-2 mt-2">
                          {Object.entries(test.statusCounts)
                            .filter(([, count]) => count > 0)
                            .map(([status, count]) => (
                              <span
                                key={status}
                                className="text-xs text-muted-foreground"
                              >
                                {count} {statusLabels[status as TestStatus]}
                              </span>
                            ))}
                        </div>
                      )}
                    </Link>
                  </div>
                  <div className="pl-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <DeleteTestButton
                      courseId={courseId}
                      testId={test.id}
                      iconOnly
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No tests yet.</p>
        )}
      </div>
    </section>
  );
}
