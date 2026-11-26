import type { Course } from "src/lib/course-service";
import type {
  SchoolGradingCounts,
  TestGradingCounts,
} from "src/lib/grading-count-service";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { buildCourseRows, coursesSummary } from "../course-rows";

const course: Course = {
  id: "course-1",
  title: "Bio",
  description: "",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  materials: [],
  inviteToken: null,
};

/** A test of course-1 with nothing waiting and nothing to release. */
function quietTest(
  testId: string,
  title: string,
  createdAt: string,
  submitted: number,
): TestGradingCounts {
  return {
    testId,
    title,
    courseId: course.id,
    createdAt: new Date(createdAt),
    isPractice: false,
    questionCount: 1,
    typeCounts: {
      free_text: 1,
      single_select: 0,
      multi_select: 0,
      image_answer: 0,
    },
    statusCounts: {
      [TestStatus.NotStarted]: 0,
      [TestStatus.InProgress]: 0,
      [TestStatus.Submitted]: 0,
      [TestStatus.Graded]: submitted,
    },
    submitted,
    waiting: 0,
    answersLeft: 0,
    fullyGraded: submitted,
    oldestWaitingAt: null,
    oldestWaitingStudentId: null,
    oldestWaitingStudentName: null,
    gradedHidden: 0,
    releasedTo: submitted,
    readyToRelease: false,
  };
}

/** School counts holding only course-1 and the given tests. */
function countsWith(tests: TestGradingCounts[]): SchoolGradingCounts {
  return {
    waiting: 0,
    testsReadyToRelease: 0,
    courses: [
      {
        courseId: course.id,
        title: course.title,
        students: 1,
        tests: tests.length,
        waiting: 0,
        testsWaiting: 0,
        testsReadyToRelease: 0,
        oldestWaitingAt: null,
      },
    ],
    tests,
    pairs: [],
  };
}

describe("buildCourseRows meta line", () => {
  it("names the tests newest first when every hand-in is graded and released", () => {
    // Given a course whose two tests have released hand-ins only
    const counts = countsWith([
      quietTest("t-old", "Structure of cell", "2026-02-01T00:00:00Z", 1),
      quietTest("t-new", "Untitled test", "2026-03-01T00:00:00Z", 1),
    ]);

    // When the rows are built
    const [row] = buildCourseRows([course], counts);

    // Then the meta line lists the test titles, newest first
    expect(row.meta).toBe("Untitled test · Structure of cell");
  });

  it("says nothing was submitted yet when the course has tests but no hand-in", () => {
    // Given a course with two tests and no student has handed in
    const counts = countsWith([
      quietTest("t-a", "Cells", "2026-02-01T00:00:00Z", 0),
      quietTest("t-b", "Genes", "2026-03-01T00:00:00Z", 0),
    ]);

    // When the rows are built
    const [row] = buildCourseRows([course], counts);

    // Then the meta line says so instead of listing the titles
    expect(row.meta).toBe("Nothing submitted yet");
  });
});

describe("coursesSummary", () => {
  it("says nothing waits when the school has courses and no hand-in waits", () => {
    expect(coursesSummary(3, 0)).toBe("3 courses · Nothing waiting");
  });
});
