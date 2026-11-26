import type {
  CourseGradingCounts,
  SchoolGradingCounts,
  TestGradingCounts,
} from "src/lib/grading-count-service";

/** One course's tests that have work waiting, in the order To grade shows them. */
export interface WaitingGroup {
  course: CourseGradingCounts;
  tests: TestGradingCounts[];
}

/**
 * Orders `a` before `b` by hand-in time, oldest first; equal times fall to the id.
 */
function byOldest(
  a: { at: Date | null; id: string },
  b: { at: Date | null; id: string },
): number {
  const diff = (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0);
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

/**
 * Groups the tests with work waiting by course. The course holding the oldest
 * waiting hand-in comes first, and inside a course the test with the oldest one.
 * @param counts - The school's grading counts.
 */
export function groupWaitingByCourse(
  counts: SchoolGradingCounts,
): WaitingGroup[] {
  return counts.courses
    .filter((course) => course.waiting > 0)
    .map((course) => ({
      course,
      tests: counts.tests
        .filter((t) => t.courseId === course.courseId && t.waiting > 0)
        .sort((a, b) =>
          byOldest(
            { at: a.oldestWaitingAt, id: a.testId },
            { at: b.oldestWaitingAt, id: b.testId },
          ),
        ),
    }))
    .sort((a, b) =>
      byOldest(
        { at: a.course.oldestWaitingAt, id: a.course.courseId },
        { at: b.course.oldestWaitingAt, id: b.course.courseId },
      ),
    );
}
