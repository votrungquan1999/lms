import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import {
  getCourseService,
  getPageGuard,
  getTestService,
} from "src/lib/services-singleton";

export const metadata = {
  title: "Course — LMS",
  description: "View course tests",
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

        {tests.length > 0 ? (
          tests.map((test) => (
            <Link
              key={test.id}
              href={`/student/courses/${courseId}/tests/${test.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="text-lg">{test.title}</CardTitle>
                  {test.description && (
                    <p className="text-sm text-muted-foreground">
                      {test.description}
                    </p>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))
        ) : (
          <p className="text-center text-muted-foreground">
            No tests available for this course yet.
          </p>
        )}
      </section>
    </main>
  );
}
