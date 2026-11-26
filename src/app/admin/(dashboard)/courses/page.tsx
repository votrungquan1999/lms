import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import { getCourseService, getPageGuard } from "src/lib/services-singleton";
import { buildCourseRows, coursesSummary } from "./course-rows";
import {
  CourseRowView,
  CoursesColumn,
  CoursesHeader,
  CoursesTable,
  FirstRunPage,
} from "./courses-list.ui";
import { CreateCourseDialog, NewCourseButton } from "./create-course-form";

export const metadata = {
  title: "Courses — LMS Admin",
  description: "Manage courses",
};

export default async function CoursesPage() {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const courseService = await getCourseService(session.school.id);
  const courses = await courseService.listCourses();
  const counts = await getSchoolGradingCounts(session.school.id);
  const rows = buildCourseRows(courses, counts);

  return (
    <CoursesColumn>
      <CreateCourseDialog schoolId={session.school.id}>
        <CoursesHeader>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {coursesSummary(courses.length, counts.waiting)}
            </p>
          </div>
          <NewCourseButton />
        </CoursesHeader>

        {rows.length > 0 ? (
          <section className="grid gap-2.5">
            <h2 className="text-lg font-semibold">
              All courses{" "}
              <span className="font-medium text-muted-foreground">
                ({rows.length})
              </span>
            </h2>
            <CoursesTable>
              {rows.map((row) => (
                <CourseRowView
                  key={row.courseId}
                  href={`/admin/courses/${row.courseId}`}
                  title={row.title}
                  meta={row.meta}
                  students={row.students}
                  tests={row.tests}
                  waiting={row.waiting}
                />
              ))}
            </CoursesTable>
          </section>
        ) : (
          <FirstRunPage>
            <NewCourseButton />
          </FirstRunPage>
        )}
      </CreateCourseDialog>
    </CoursesColumn>
  );
}
