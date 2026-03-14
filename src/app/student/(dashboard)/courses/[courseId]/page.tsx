import { ChevronRight } from "lucide-react";
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
  Card,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
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

const statusConfig: Record<
  TestStatus,
  { label: string; className: string; dot: string }
> = {
  [TestStatus.NotStarted]: {
    label: "Not Started",
    className: "bg-gray-100 text-gray-700",
    dot: "bg-gray-400",
  },
  [TestStatus.InProgress]: {
    label: "In Progress",
    className: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-500",
  },
  [TestStatus.Submitted]: {
    label: "Submitted",
    className: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  [TestStatus.Graded]: {
    label: "Graded",
    className: "bg-green-100 text-green-700",
    dot: "bg-green-500",
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
      return { ...test, status, questionCount: questions.length };
    }),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-2xl mx-auto">
        <Breadcrumb className="mb-4">
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
        <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
        {course.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {course.description}
          </p>
        )}
      </header>

      <section className="w-full max-w-2xl mx-auto space-y-4">
        <h2 className="text-xl font-semibold">Tests</h2>

        {testsWithStatus.length > 0 ? (
          <div className="space-y-3">
            {testsWithStatus.map((test) => {
              const config = statusConfig[test.status];
              return (
                <Link
                  key={test.id}
                  href={`/student/courses/${courseId}/tests/${test.id}`}
                  className="block"
                >
                  <Card size="sm" className="transition-all hover:bg-accent/50 hover:shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{test.title}</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {test.questionCount} question
                            {test.questionCount !== 1 ? "s" : ""}
                            {test.description && ` · ${test.description}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${config.dot}`}
                            />
                            {config.label}
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">
            No tests available for this course yet.
          </p>
        )}
      </section>
    </div>
  );
}
