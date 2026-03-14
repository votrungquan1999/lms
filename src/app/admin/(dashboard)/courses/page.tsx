import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { getCourseService } from "src/lib/services-singleton";
import { CreateCourseDialog } from "./create-course-form";

export const metadata = {
  title: "Courses — LMS Admin",
  description: "Manage courses",
};

export default async function CoursesPage() {
  const courseService = await getCourseService();
  const courses = await courseService.listCourses();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {courses.length} course{courses.length !== 1 ? "s" : ""}
          </p>
        </div>
        <CreateCourseDialog />
      </header>

      {courses.length > 0 ? (
        <div className="space-y-3">
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
      ) : (
        <p className="text-center text-muted-foreground">
          No courses yet. Click &quot;Add Course&quot; to create one.
        </p>
      )}
    </div>
  );
}
