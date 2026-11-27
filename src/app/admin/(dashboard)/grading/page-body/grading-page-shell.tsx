import { readGradingScreen } from "src/lib/grading-screen-read";
import { needsGrade } from "src/lib/needs-grade";
import type { Test } from "src/lib/test-service";
import { hasSubmitted, TestStatus } from "src/lib/test-status-service";
import { GradingDetailQuestion } from "./grading-detail-question";
import { GradingDetailStudent } from "./grading-detail-student";
import {
  GradingMode,
  GradingSort,
  type RosterStudentCellModel,
} from "./grading-page-body.type";
import {
  GradingProgress,
  PivotToggle,
  TwoPaneShell,
} from "./grading-page-shell.ui";
import { GradingRoster } from "./grading-roster";
import { GradingRosterQuestions } from "./grading-roster-questions";
import { GradingTopBar, StudentPosition } from "./grading-top-bar.ui";
import { gradingHref } from "./href";

interface GradingSelection {
  mode: GradingMode;
  studentId?: string;
  questionId?: string;
  sort: GradingSort;
}

interface GradingPageShellProps {
  test: Test;
  courseId: string;
  /** The page's school — never resolved here. */
  schoolId: string;
  /** Base URL (no query string) used to build roster cell + pivot toggle hrefs. */
  basePath: string;
  /** URL-driven selection. Unknown ids soft-fall-back to the first student/question. */
  selection: GradingSelection;
  /** Controls shown at the right end of the top bar. */
  barActions?: React.ReactNode;
}

/**
 * Grading shell: a top bar over a roster and the focused detail. Student-mode
 * renders the student roster on the left and the focused student's full detail
 * on the right. Question-mode swaps the roster to a list of questions and the
 * right pane to one row per enrolled student for the focused question.
 */
export async function GradingPageShell({
  test,
  courseId,
  schoolId,
  basePath,
  selection,
  barActions,
}: GradingPageShellProps) {
  const screen = await readGradingScreen(schoolId, test);
  const { questions, students: orderedStudents } = screen;

  const cellsInEnrollmentOrder: RosterStudentCellModel[] = orderedStudents.map(
    (s) => {
      const status = screen.pairs.get(s.id)?.status ?? TestStatus.NotStarted;
      const answeredCount = screen.answers.get(s.id)?.size ?? 0;
      return {
        id: s.id,
        name: s.name,
        username: s.username,
        status,
        gradedCount: screen.grades.get(s.id)?.size ?? 0,
        answeredCount,
        // A question is only "blank" once the student can no longer answer it.
        blankCount: hasSubmitted(status) ? questions.length - answeredCount : 0,
      };
    },
  );

  // Apply the selected sort. Tiebreaker is enrollment index (newest-first),
  // which matches the legacy body's behavior for status sort.
  const cells = sortCells(cellsInEnrollmentOrder, selection.sort);
  const sortedStudentIds = cells.map((c) => c.id);
  const studentByIdLookup = new Map(orderedStudents.map((s) => [s.id, s]));

  const requestedId = selection.studentId;
  const focused =
    (requestedId && studentByIdLookup.get(requestedId)) ||
    studentByIdLookup.get(sortedStudentIds[0] ?? "") ||
    null;

  const requestedQuestionId = selection.questionId;
  const requestedQuestion =
    (requestedQuestionId &&
      questions.find((q) => q.id === requestedQuestionId)) ||
    null;
  const focusedQuestion =
    requestedQuestion ||
    // By student opens the student's first answer that needs a grade.
    (selection.mode === GradingMode.Student && focused
      ? questions.find((q) =>
          needsGrade({
            answered: screen.answers.get(focused.id)?.has(q.id) ?? false,
            latestAnswerAt:
              screen.answers.get(focused.id)?.get(q.id)?.submittedAt ?? null,
            grade: screen.grades.get(focused.id)?.get(q.id) ?? null,
            redoOpen: screen.pairs.get(focused.id)?.redoRequested ?? false,
          }),
        )
      : undefined) ||
    questions[0] ||
    null;

  const main =
    selection.mode === GradingMode.Question ? (
      focusedQuestion ? (
        await GradingDetailQuestion({
          test,
          courseId,
          schoolId,
          questionId: focusedQuestion.id,
          students: sortedStudentIds
            .map((id) => studentByIdLookup.get(id))
            .filter((s): s is NonNullable<typeof s> => s !== undefined)
            .map((s) => ({
              id: s.id,
              name: s.name,
              username: s.username,
            })),
          basePath,
          sort: selection.sort,
        })
      ) : (
        <p className="text-sm text-muted-foreground">
          This test has no questions yet.
        </p>
      )
    ) : focused && questions.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        This test has no questions yet.
      </p>
    ) : focused ? (
      <>
        {(screen.counts?.submitted ?? 0) === 0 && (
          <p className="mb-4 text-sm text-muted-foreground">
            Nobody has submitted yet.
          </p>
        )}
        {
          await GradingDetailStudent({
            test,
            courseId,
            schoolId,
            student: focused,
            questionId: focusedQuestion?.id,
            basePath,
            sort: selection.sort,
          })
        }
      </>
    ) : (
      <p className="text-sm text-muted-foreground">
        No students enrolled in this course yet.
      </p>
    );

  // Progress: By student counts fully graded students over the students who
  // handed in; By question counts the focused question's graded students over
  // the enrolled ones.
  let progress = {
    numerator: screen.counts?.fullyGraded ?? 0,
    denominator: screen.counts?.submitted ?? 0,
    label: "fully graded",
  };
  if (selection.mode === GradingMode.Question && focusedQuestion) {
    const resolved = cellsInEnrollmentOrder.filter((c) => {
      if (screen.grades.get(c.id)?.has(focusedQuestion.id)) return true;
      // No grade row: only a submitted student's blank counts as
      // resolved — an in-progress student may still go back and answer.
      return (
        hasSubmitted(c.status) &&
        !screen.answers.get(c.id)?.has(focusedQuestion.id)
      );
    });
    progress = {
      numerator: resolved.length,
      denominator: orderedStudents.length,
      label: "students graded",
    };
  }

  // ‹ › step through the students who handed in, in roster order.
  const submittedIds = cells
    .filter((c) => hasSubmitted(c.status))
    .map((c) => c.id);
  const focusedIndex = focused ? submittedIds.indexOf(focused.id) : -1;
  const studentHref = (id: string | undefined) =>
    id === undefined
      ? null
      : gradingHref({
          basePath,
          mode: GradingMode.Student,
          studentId: id,
          sort: selection.sort,
        });
  // A student outside the list opens the first one with › and the last with ‹.
  const previousId =
    focusedIndex === -1
      ? submittedIds[submittedIds.length - 1]
      : submittedIds[focusedIndex - 1];
  const nextId =
    focusedIndex === -1 ? submittedIds[0] : submittedIds[focusedIndex + 1];

  return (
    <TwoPaneShell
      topBar={
        <GradingTopBar
          backHref={`/admin/courses/${courseId}/tests/${test.id}`}
          testTitle={test.title}
          pivot={
            <PivotToggle
              mode={selection.mode}
              basePath={basePath}
              studentId={focused?.id}
              questionId={focusedQuestion?.id}
            />
          }
          position={
            selection.mode === GradingMode.Student && focused ? (
              <StudentPosition
                name={focused.name}
                index={focusedIndex === -1 ? null : focusedIndex + 1}
                submittedCount={submittedIds.length}
                previousHref={studentHref(previousId)}
                nextHref={studentHref(nextId)}
              />
            ) : null
          }
          progress={<GradingProgress {...progress} />}
          actions={barActions}
        />
      }
      roster={
        selection.mode === GradingMode.Question ? (
          <GradingRosterQuestions
            questions={questions}
            basePath={basePath}
            activeQuestionId={focusedQuestion?.id ?? null}
          />
        ) : (
          <GradingRoster
            cells={cells}
            basePath={basePath}
            activeStudentId={focused?.id ?? null}
            sort={selection.sort}
          />
        )
      }
      main={main}
      fillScreen={selection.mode === GradingMode.Student}
    />
  );
}

const STATUS_SORT_RANK: Record<TestStatus, number> = {
  [TestStatus.Submitted]: 0,
  [TestStatus.InProgress]: 1,
  [TestStatus.NotStarted]: 2,
  [TestStatus.Graded]: 3,
};

/**
 * Applies the URL-selected sort to the roster cells. The input order is
 * enrollment order (newest-first); that order is the tiebreaker for every
 * sort criterion, matching the legacy body's status-sort behavior.
 */
function sortCells(
  enrollmentOrder: RosterStudentCellModel[],
  sort: GradingSort,
): RosterStudentCellModel[] {
  // Capture enrollment index per id BEFORE sorting so the tiebreaker is stable.
  const indexById = new Map(enrollmentOrder.map((c, i) => [c.id, i]));
  const indexed = [...enrollmentOrder];

  switch (sort) {
    case GradingSort.Name:
      indexed.sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) return byName;
        return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
      });
      return indexed;
    case GradingSort.Status:
      indexed.sort((a, b) => {
        const byStatus =
          STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
        if (byStatus !== 0) return byStatus;
        return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
      });
      return indexed;
    default:
      return enrollmentOrder;
  }
}
