import type {
  CourseGradingCounts,
  SchoolGradingCounts,
  TestGradingCounts,
} from "src/lib/grading-count-service";
import { describe, expect, it } from "vitest";
import { groupWaitingByCourse } from "../to-grade-groups";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

function course(
  courseId: string,
  oldestWaitingAt: Date | null,
): CourseGradingCounts {
  return {
    courseId,
    title: courseId,
    students: 0,
    tests: 0,
    waiting: 1,
    testsWaiting: 1,
    testsReadyToRelease: 0,
    oldestWaitingAt,
  };
}

function test(
  testId: string,
  courseId: string,
  oldestWaitingAt: Date | null,
): TestGradingCounts {
  return { testId, courseId, waiting: 1, oldestWaitingAt } as TestGradingCounts;
}

function schoolWith(
  courses: CourseGradingCounts[],
  tests: TestGradingCounts[],
): SchoolGradingCounts {
  return { courses, tests } as SchoolGradingCounts;
}

describe("Feature: To grade lists the course and test with the oldest waiting hand-in first", () => {
  it("orders courses and the tests inside them oldest waiting first, whatever order the counts arrive in", () => {
    const groups = groupWaitingByCourse(
      schoolWith(
        [course("c-new", day(9)), course("c-old", day(2))],
        [
          test("t-new-b", "c-new", day(9)),
          test("t-old-late", "c-old", day(7)),
          test("t-new-a", "c-new", day(8)),
          test("t-old-early", "c-old", day(2)),
        ],
      ),
    );

    expect(groups.map((g) => g.course.courseId)).toEqual(["c-old", "c-new"]);
    expect(groups[0].tests.map((t) => t.testId)).toEqual([
      "t-old-early",
      "t-old-late",
    ]);
    expect(groups[1].tests.map((t) => t.testId)).toEqual([
      "t-new-a",
      "t-new-b",
    ]);
  });

  it("breaks a tie on waiting time by id, so the order never flips between loads", () => {
    const groups = groupWaitingByCourse(
      schoolWith(
        [course("c-b", day(3)), course("c-a", day(3))],
        [test("t-2", "c-a", day(3)), test("t-1", "c-a", day(3))],
      ),
    );

    expect(groups.map((g) => g.course.courseId)).toEqual(["c-a", "c-b"]);
    expect(groups[0].tests.map((t) => t.testId)).toEqual(["t-1", "t-2"]);
  });
});
