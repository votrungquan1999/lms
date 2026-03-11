import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import { Separator } from "src/components/ui/separator";
import {
  getCourseService,
  getPageGuard,
  getStudentService,
  getTestService,
} from "src/lib/services-singleton";
import { CreateTestForm } from "./create-test-form";
import { EnrollStudentDialog } from "./enroll-student-form";

export const metadata = {
  title: "Course Detail — LMS Admin",
  description: "Manage course enrollments and tests",
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

        {tests.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Tests</h2>
            {tests.map((test) => (
              <Link
                key={test.id}
                href={`/admin/courses/${courseId}/tests/${test.id}`}
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
