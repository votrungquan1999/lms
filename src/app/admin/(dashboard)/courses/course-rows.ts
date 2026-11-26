import type { Course } from "src/lib/course-service";
import type {
  CourseGradingCounts,
  SchoolGradingCounts,
} from "src/lib/grading-count-service";
import { pluralize } from "src/lib/pluralize";

/** One row of the Courses list. */
export interface CourseRow {
  courseId: string;
  title: string;
  students: number;
  tests: number;
  waiting: number;
  /** The tests that need the teacher, or why none does. */
  meta: string;
}

const emptyCounts = (course: Course): CourseGradingCounts => ({
  courseId: course.id,
  title: course.title,
  students: 0,
  tests: 0,
  waiting: 0,
  testsWaiting: 0,
  testsReadyToRelease: 0,
  oldestWaitingAt: null,
});

/**
 * Builds the Courses list rows: the course with the most submissions waiting
 * first, then the newest, with the id as the last tie-break so the order never flips.
 * @param courses - The school's courses.
 * @param counts - The school's grading counts.
 */
export function buildCourseRows(
  courses: Course[],
  counts: SchoolGradingCounts,
): CourseRow[] {
  const byId = new Map(counts.courses.map((c) => [c.courseId, c]));
  return courses
    .map((course) => ({
      course,
      stats: byId.get(course.id) ?? emptyCounts(course),
    }))
    .sort(
      (a, b) =>
        b.stats.waiting - a.stats.waiting ||
        b.course.createdAt.getTime() - a.course.createdAt.getTime() ||
        a.course.id.localeCompare(b.course.id),
    )
    .map(({ course, stats }) => ({
      courseId: course.id,
      title: course.title,
      students: stats.students,
      tests: stats.tests,
      waiting: stats.waiting,
      meta: metaLine(course.id, stats, counts),
    }));
}

/**
 * Names the tests with work waiting, oldest first, then those graded but not
 * released; with neither, every test title, newest first.
 */
function metaLine(
  courseId: string,
  stats: CourseGradingCounts,
  counts: SchoolGradingCounts,
): string {
  const tests = counts.tests.filter((t) => t.courseId === courseId);
  const waiting = tests
    .filter((t) => t.waiting > 0)
    .sort(
      (a, b) =>
        (a.oldestWaitingAt?.getTime() ?? 0) -
          (b.oldestWaitingAt?.getTime() ?? 0) ||
        a.testId.localeCompare(b.testId),
    )
    .map(
      (t) =>
        `${t.title} has ${t.waiting} ${pluralize(t.waiting, "submission")} waiting`,
    );
  const toRelease = tests
    .filter((t) => t.readyToRelease)
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title) || a.testId.localeCompare(b.testId),
    )
    .map((t) => `${t.title} graded, not released`);
  const needsWork = [...waiting, ...toRelease];
  if (needsWork.length > 0) return needsWork.join(" · ");
  if (stats.tests === 0) return "No tests yet";
  if (!tests.some((t) => t.submitted > 0)) return "Nothing submitted yet";
  return tests
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.testId.localeCompare(b.testId),
    )
    .map((t) => t.title)
    .join(" · ");
}

/**
 * The line under the Courses heading.
 * @param courseCount - How many courses the school has.
 * @param waiting - Submissions waiting for a grade across the school.
 */
export function coursesSummary(courseCount: number, waiting: number): string {
  const courses = `${courseCount} ${pluralize(courseCount, "course")}`;
  if (waiting > 0) {
    return `${courses} · ${waiting} ${pluralize(waiting, "submission")} waiting for a grade`;
  }
  // The first-run page below already says there is nothing yet
  return courseCount > 0 ? `${courses} · Nothing waiting` : courses;
}
