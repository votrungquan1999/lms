import {
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { getRequestContext } from "src/lib/request-context";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import type { TestStatus } from "src/lib/test-status-service";
import { EmptyState } from "../_ui/empty-state.ui";
import { PageHeader } from "../_ui/page-header.ui";
import { StatCard } from "../_ui/stat-card.ui";
import { CourseCard } from "./course-card.ui";
import { summarizeTestStatuses } from "./dashboard-summary";

export const metadata = {
  title: "My Courses — LMS",
  description: "View your enrolled courses",
};

/**
 * Student dashboard: a summary of test progress across all enrolled courses plus
 * a grid of course tiles linking into each course.
 */
export default async function StudentDashboardPage() {
  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();
  const { username, studentId } = session;

  const enrollmentService = await getEnrollmentService();
  const enrollments =
    await enrollmentService.listEnrollmentsByStudent(studentId);

  const courseService = await getCourseService();
  const enrolledCourses = await courseService.getCoursesByIds(
    enrollments.map((e) => e.courseId),
  );

  const testService = await getTestService();
  const testStatusService = await getTestStatusService();
  const ctx = await getRequestContext();

  // Collect per-course test statuses; flatten for the overall summary.
  const coursesWithSummary = await Promise.all(
    enrolledCourses.map(async (course) => {
      const tests = await testService.listTests(course.id);
      const statuses: TestStatus[] = await Promise.all(
        tests.map(async (test) => {
          const questionCount = await ctx.questionCountLoader.load(test.id);
          return testStatusService.getStatus(test.id, studentId, questionCount);
        }),
      );
      const summary = summarizeTestStatuses(statuses);
      return { ...course, total: tests.length, ...summary };
    }),
  );

  const overall = coursesWithSummary.reduce(
    (acc, c) => ({
      toDo: acc.toDo + c.toDo,
      awaitingGrade: acc.awaitingGrade + c.awaitingGrade,
      graded: acc.graded + c.graded,
    }),
    { toDo: 0, awaitingGrade: 0, graded: 0 },
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <PageHeader
        title={`Welcome, ${username}!`}
        description="Here's where your courses stand."
      />

      {enrolledCourses.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Courses"
            value={enrolledCourses.length}
            icon={GraduationCap}
          />
          <StatCard
            label="To do"
            value={overall.toDo}
            icon={ListChecks}
            tone="warning"
          />
          <StatCard
            label="Awaiting grade"
            value={overall.awaitingGrade}
            icon={Clock}
            tone="info"
          />
          <StatCard
            label="Graded"
            value={overall.graded}
            icon={CheckCircle2}
            tone="success"
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Your courses</h2>
        {coursesWithSummary.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {coursesWithSummary.map((course) => (
              <Link key={course.id} href={`/student/courses/${course.id}`}>
                <CourseCard
                  title={course.title}
                  description={course.description}
                  total={course.total}
                  graded={course.graded}
                  toDo={course.toDo}
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            message="You are not enrolled in any courses yet."
          />
        )}
      </section>
    </div>
  );
}
