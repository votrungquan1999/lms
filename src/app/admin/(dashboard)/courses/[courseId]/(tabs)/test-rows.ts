import type { SchoolGradingCounts } from "src/lib/grading-count-service";
import { pluralize } from "src/lib/pluralize";
import { questionTypeSummary } from "src/lib/question-type-words";
import { relativeDay } from "src/lib/relative-time";
import {
  GradeReleaseKind,
  type GradeReleaseState,
  gradeReleaseState,
  gradeReleaseText,
} from "src/lib/release-state";
import type { Test } from "src/lib/test-service";

export enum PillTone {
  Amber = "amber",
  Green = "green",
  Grey = "grey",
  Blue = "blue",
  Plain = "plain",
}

export enum RowAction {
  Grade = "grade",
  Release = "release",
  Open = "open",
}

/** A word and its colour in the Grading or Students see column. */
export interface TestRowPill {
  text: string;
  tone: PillTone;
}

/** One test as the Tests tab shows it, ready to render. */
export interface TestRowData {
  testId: string;
  courseId: string;
  title: string;
  tags: string[];
  /** Question counts by type, e.g. "30 questions · 20 single choice". */
  meta: string;
  /** The line under the title in "Needs your action". */
  actionLine: string;
  /** "2 of 5" */
  submitted: string;
  grading: TestRowPill;
  see: TestRowPill;
  action: RowAction;
  /** Something waits to be graded. */
  waiting: boolean;
  isPractice: boolean;
  /** Students see is exactly "Not released". */
  notReleased: boolean;
}

/** Zero counts for a test the school count does not list. */
const NO_TYPE_COUNTS = {
  free_text: 0,
  single_select: 0,
  multi_select: 0,
  image_answer: 0,
};

const SEE_TONES: Record<GradeReleaseKind, PillTone> = {
  [GradeReleaseKind.ShownOnSubmit]: PillTone.Blue,
  [GradeReleaseKind.Released]: PillTone.Green,
  [GradeReleaseKind.ReleasedToSome]: PillTone.Amber,
  [GradeReleaseKind.NotReleased]: PillTone.Grey,
};

/**
 * The pill that shows a test's release state next to a test row.
 * @param state - The test's grade release state.
 * @returns The pill's text and tone.
 */
function seeFromState(state: GradeReleaseState): TestRowPill {
  return { text: gradeReleaseText(state), tone: SEE_TONES[state.kind] };
}

/**
 * Builds the Tests tab's rows from the course's tests and the school's grading
 * counts, keeping the tests' own (newest first) order.
 * @param tests - The course's live tests.
 * @param counts - The school's grading counts, shared with the sidebar badge.
 * @param now - The clock for "submitted yesterday".
 */
export function buildTestRows(
  tests: Test[],
  counts: SchoolGradingCounts,
  now: Date,
): TestRowData[] {
  const courseStudents = new Map(
    counts.courses.map((course) => [course.courseId, course.students]),
  );
  const byTest = new Map(counts.tests.map((t) => [t.testId, t]));

  return tests.map((test) => {
    const c = byTest.get(test.id);
    const questionCount = c?.questionCount ?? 0;
    const submitted = c?.submitted ?? 0;
    const waiting = c?.waiting ?? 0;
    const releasedTo = c?.releasedTo ?? 0;
    const fullyGraded = c?.fullyGraded ?? 0;

    const grading: TestRowPill = test.isPractice
      ? { text: "Practice, no grades", tone: PillTone.Plain }
      : submitted === 0
        ? { text: "Nothing submitted", tone: PillTone.Grey }
        : waiting > 0
          ? { text: `${waiting} waiting`, tone: PillTone.Amber }
          : { text: "All graded", tone: PillTone.Green };

    const see: TestRowPill = test.isPractice
      ? { text: "Answers as they go", tone: PillTone.Blue }
      : submitted === 0
        ? { text: "Nothing yet", tone: PillTone.Plain }
        : seeFromState(gradeReleaseState(test, { releasedTo, fullyGraded }));

    const action =
      waiting > 0
        ? RowAction.Grade
        : c?.readyToRelease
          ? RowAction.Release
          : RowAction.Open;

    const answersLeft = c?.answersLeft ?? 0;
    const actionLine =
      action === RowAction.Grade
        ? `${c?.oldestWaitingStudentName ?? "A student"} submitted ${
            c?.oldestWaitingAt ? relativeDay(c.oldestWaitingAt, now) : "earlier"
          } · ${answersLeft} ${pluralize(answersLeft, "answer")} left · ${questionCount} ${pluralize(questionCount, "question")}`
        : `All ${submitted} ${pluralize(submitted, "submission")} graded · students can't see their grades yet`;

    const tags: string[] = [];
    if (test.isPractice) tags.push("Practice");
    if (test.timeLimitMinutes) tags.push(`Timed ${test.timeLimitMinutes} min`);
    if (questionCount === 0) tags.push("No questions yet");

    return {
      testId: test.id,
      courseId: test.courseId,
      title: test.title,
      tags,
      meta: questionTypeSummary(questionCount, c?.typeCounts ?? NO_TYPE_COUNTS),
      actionLine,
      submitted: `${submitted} of ${courseStudents.get(test.courseId) ?? 0}`,
      grading,
      see,
      action,
      waiting: waiting > 0,
      isPractice: test.isPractice,
      notReleased: see.text === "Not released",
    };
  });
}
