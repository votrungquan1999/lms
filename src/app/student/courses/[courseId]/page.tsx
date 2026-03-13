import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import {
  getCourseService,
  getPageGuard,
  getQuestionService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";

export const metadata = {
  title: "Course — LMS",
  description: "View course tests",
};

const statusConfig: Record<TestStatus, { label: string; className: string }> = {
  [TestStatus.NotStarted]: {
    label: "Not Started",
    className: "bg-gray-100 text-gray-700",
  },
  [TestStatus.InProgress]: {
    label: "In Progress",
    className: "bg-yellow-100 text-yellow-700",
  },
  [TestStatus.Submitted]: {
    label: "Submitted",
    className: "bg-blue-100 text-blue-700",
  },
  [TestStatus.Graded]: {
    label: "Graded",
    className: "bg-green-100 text-green-700",
  },
};

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

  // Compute status for each test
  const testsWithStatus = await Promise.all(
    tests.map(async (test) => {
      const questions = await questionService.listQuestions(test.id);
      const status = await testStatusService.getStatus(
        test.id,
        session.studentId,
        questions.length,
      );
      return { ...test, status };
    }),
  );

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/student/dashboard" className="hover:underline">
            ← My Courses
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
        {course.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {course.description}
          </p>
        )}
      </header>

      <section className="w-full max-w-2xl space-y-3">
        <h2 className="text-xl font-semibold">Tests</h2>

        {testsWithStatus.length > 0 ? (
          testsWithStatus.map((test) => {
            const config = statusConfig[test.status];
            return (
              <Link
                key={test.id}
                href={`/student/courses/${courseId}/tests/${test.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{test.title}</CardTitle>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
                      >
                        {config.label}
                      </span>
                    </div>
                    {test.description && (
                      <p className="text-sm text-muted-foreground">
                        {test.description}
                      </p>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            );
          })
        ) : (
          <p className="text-center text-muted-foreground">
            No tests available for this course yet.
          </p>
        )}
      </section>
    </main>
  );
}
