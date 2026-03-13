import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import { Separator } from "src/components/ui/separator";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getQuestionService,
  getStudentService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { CreateTestForm } from "./create-test-form";
import { EnrollStudentDialog } from "./enroll-student-form";

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
  const { courseId } = await params;

  const guard = await getPageGuard();
  await guard.requireAdminLogin();

  const courseService = await getCourseService();
  const course = await courseService.getCourse(courseId);

  if (!course) {
    notFound();
  }

  const testService = await getTestService();
  const tests = await testService.listTests(courseId);

  const studentService = await getStudentService();
  const students = await studentService.listStudents();

  const enrollmentService = await getEnrollmentService();
  const enrolledStudentIds =
    await enrollmentService.listEnrollmentsByCourse(courseId);

  const questionService = await getQuestionService();
  const testStatusService = await getTestStatusService();

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
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/admin/courses" className="hover:underline">
            ← Courses
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
        {course.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {course.description}
          </p>
        )}
      </header>

      <section className="w-full max-w-2xl space-y-6">
        <EnrollStudentDialog courseId={courseId} students={students} />

        <Separator />

        <CreateTestForm courseId={courseId} />

        {testsWithSummary.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Tests</h2>
            {testsWithSummary.map((test) => (
              <Link
                key={test.id}
                href={`/admin/courses/${courseId}/tests/${test.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{test.title}</CardTitle>
                      {test.totalStudents > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {test.statusCounts[TestStatus.Graded]}/
                          {test.totalStudents} graded
                        </span>
                      )}
                    </div>
                    {test.description && (
                      <p className="text-sm text-muted-foreground">
                        {test.description}
                      </p>
                    )}
                    {test.totalStudents > 0 && (
                      <div className="flex gap-2 mt-1">
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
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {tests.length === 0 && (
          <p className="text-center text-muted-foreground">
            No tests yet. Create one above.
          </p>
        )}
      </section>
    </main>
  );
}
