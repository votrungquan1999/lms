import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import { Separator } from "src/components/ui/separator";
import {
  getCourseService,
  getEnrollmentService,
  getQuestionService,
  getStudentService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { CreateTestDialog } from "./create-test-form";
import { ManageEnrollmentsDialog } from "./enroll-student-form";

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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
        {course.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {course.description}
          </p>
        )}
      </header>

      <section className="w-full max-w-2xl space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Enrolled Students ({enrolledStudentIds.length})
            </h2>
            <ManageEnrollmentsDialog
              courseId={courseId}
              students={students}
              enrolledStudentIds={enrolledStudentIds}
            />
          </div>
          {enrolledStudentIds.length > 0 ? (
            <div className="space-y-2">
              {students
                .filter((s) => enrolledStudentIds.includes(s.id))
                .map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-2 rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">
                        @{student.username}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No students enrolled yet.
            </p>
          )}
        </div>

        <Separator />

        <CreateTestDialog courseId={courseId} />

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
    </div>
  );
}
