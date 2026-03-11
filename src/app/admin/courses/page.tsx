import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { getCourseService, getPageGuard } from "src/lib/services-singleton";
import { CreateCourseForm } from "./create-course-form";

export const metadata = {
  title: "Courses — LMS Admin",
  description: "Manage courses",
};

export default async function CoursesPage() {
  const guard = await getPageGuard();
  await guard.requireAdminLogin();

  const courseService = await getCourseService();
  const courses = await courseService.listCourses();

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/admin/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
      </header>

      <section className="w-full max-w-2xl space-y-6">
        <CreateCourseForm />

        {courses.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">All Courses</h2>
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/admin/courses/${course.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{course.title}</CardTitle>
                  </CardHeader>
                  {course.description && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {course.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}

        {courses.length === 0 && (
          <p className="text-center text-muted-foreground">
            No courses yet. Create one above.
          </p>
        )}
      </section>
    </main>
  );
}
