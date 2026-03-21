import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { getRequestContext } from "src/lib/request-context";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";

export const metadata = {
  title: "My Courses — LMS",
  description: "View your enrolled courses",
};

export default async function StudentDashboardPage() {
  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();
  const { username, studentId } = session;

  const enrollmentService = await getEnrollmentService();
  const enrollments =
    await enrollmentService.listEnrollmentsByStudent(studentId);

  const courseService = await getCourseService();
  const courseIds = enrollments.map((e) => e.courseId);
  const enrolledCourses = await courseService.getCoursesByIds(courseIds);

  const testService = await getTestService();
  const testStatusService = await getTestStatusService();
  const ctx = await getRequestContext();

  // Compute test summary for each course
  const coursesWithSummary = await Promise.all(
    enrolledCourses.map(async (course) => {
      const tests = await testService.listTests(course.id);
      let needsAction = 0;

      for (const test of tests) {
        const questionCount = await ctx.questionCountLoader.load(test.id);
        const status = await testStatusService.getStatus(
          test.id,
          studentId,
          questionCount,
        );
        if (
          status === TestStatus.NotStarted ||
          status === TestStatus.InProgress
        ) {
          needsAction++;
        }
      }

      return { ...course, testCount: tests.length, needsAction };
    }),
  );

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {username}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your courses</p>
      </header>

      <section className="w-full max-w-2xl space-y-3">
        {coursesWithSummary.length > 0 ? (
          coursesWithSummary.map((course) => (
            <Link
              key={course.id}
              href={`/student/courses/${course.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  {course.description && (
                    <p className="text-sm text-muted-foreground">
                      {course.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {course.testCount} test
                      {course.testCount !== 1 ? "s" : ""}
                    </span>
                    {course.needsAction > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                        <span className="size-1.5 rounded-full bg-yellow-500" />
                        {course.needsAction} needs submission
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <p className="text-center text-muted-foreground">
            You are not enrolled in any courses yet.
          </p>
        )}
      </section>
    </main>
  );
}
