import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "src/components/ui/button";
import { pluralize } from "src/lib/pluralize";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import { getCourseService, getPageGuard } from "src/lib/services-singleton";
import { CreateTestDialog } from "../create-test-form";
import { CourseTabs } from "./course-tabs";

/**
 * The course page frame shared by the Tests, Students and Materials tabs:
 * title, counts, Export results, New test and the tab strip.
 */
export default async function CourseTabsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);
  if (!course) notFound();

  // Shares the request's cached school count with the sidebar badge.
  const counts = await getSchoolGradingCounts(session.school.id);
  const courseCounts = counts.courses.find((c) => c.courseId === courseId);
  const students = courseCounts?.students ?? 0;
  const tests = courseCounts?.tests ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {/* Phone: buttons drop below the title block so it keeps the full width. */}
      <header className="flex w-full max-w-6xl flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-x-4">
        <div className="min-w-0 md:flex-1">
          <h1 className="text-3xl font-bold tracking-tight wrap-anywhere">
            {course.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students} {pluralize(students, "student")} · {tests}{" "}
            {pluralize(tests, "test")}
          </p>
          {course.description && (
            <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">
              {course.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button asChild variant="outline">
            <Link href={`/admin/courses/${courseId}/results-report`}>
              Export results
            </Link>
          </Button>
          <CreateTestDialog courseId={courseId} />
        </div>
      </header>

      <div className="w-full max-w-6xl">
        <CourseTabs courseId={courseId} />
      </div>

      <div className="flex w-full max-w-6xl flex-col gap-6">{children}</div>
    </div>
  );
}
