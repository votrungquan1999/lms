import Link from "next/link";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import { getCourseService, getEnrollmentService, getPageGuard } from "src/lib/services-singleton";

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

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {username}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your courses</p>
      </header>

      <section className="w-full max-w-2xl space-y-3">
        {enrolledCourses.length > 0 ? (
          enrolledCourses.map((course) => (
            <Link
              key={course.id}
              href={`/student/courses/${course.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  {course.description && (
                    <p className="text-sm text-muted-foreground">
                      {course.description}
                    </p>
                  )}
                </CardHeader>
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
