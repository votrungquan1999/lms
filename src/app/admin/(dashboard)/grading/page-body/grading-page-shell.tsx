import {
  getAnswerService,
  getEnrollmentService,
  getGradeService,
  getQuestionService,
  getStudentService,
  getTestStatusService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";
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

interface GradingSelection {
  mode: GradingMode;
  studentId?: string;
  questionId?: string;
  sort: GradingSort;
}

interface GradingPageShellProps {
  test: Test;
  courseId: string;
  /** Base URL (no query string) used to build roster cell + pivot toggle hrefs. */
  basePath: string;
  /** URL-driven selection. Unknown ids soft-fall-back to the first student/question. */
  selection: GradingSelection;
}

/**
 * Two-pane grading shell with a pivot toggle. Student-mode renders the
 * student roster on the left and the focused student's full detail on the
 * right. Question-mode swaps the roster to a list of questions and the
 * right pane to one row per enrolled student for the focused question.
 */
export async function GradingPageShell({
  test,
  courseId,
  basePath,
  selection,
}: GradingPageShellProps) {
  const enrollmentService = await getEnrollmentService();
  const studentIds = await enrollmentService.listEnrollmentsByCourse(courseId);

  const studentService = await getStudentService();
  const students = await studentService.findByIds(studentIds);

  const studentById = new Map(students.map((s) => [s.id, s]));
  const orderedStudents = studentIds
    .map((id) => studentById.get(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(test.id);

  const answerService = await getAnswerService();
  const gradeService = await getGradeService();
  const testStatusService = await getTestStatusService();

  const cellsInEnrollmentOrder: RosterStudentCellModel[] = await Promise.all(
    orderedStudents.map(async (s) => {
      const latestAnswers = await answerService.getLatestAnswers(test.id, s.id);
      const grades = await gradeService.getGrades(test.id, s.id);
      const status = await testStatusService.getStatus(
        test.id,
        s.id,
        questions.length,
      );

      return {
        id: s.id,
        name: s.name,
        username: s.username,
        status,
        gradedCount: grades.length,
        answeredCount: latestAnswers.length,
      };
    }),
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
  const focusedQuestion =
    (requestedQuestionId &&
      questions.find((q) => q.id === requestedQuestionId)) ||
    questions[0] ||
    null;

  const main =
    selection.mode === GradingMode.Question ? (
      focusedQuestion ? (
        await GradingDetailQuestion({
          test,
          courseId,
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
          No questions on this test yet.
        </p>
      )
    ) : focused ? (
      await GradingDetailStudent({
        test,
        courseId,
        student: focused,
        basePath,
        sort: selection.sort,
      })
    ) : (
      <p className="text-sm text-muted-foreground">
        No students enrolled in this course yet.
      </p>
    );

  // Progress fraction: student-mode = fully-graded students / enrolled;
  // question-mode = students with a grade for the active question / enrolled.
  const denominator = orderedStudents.length;
  let numerator = 0;
  if (selection.mode === GradingMode.Question && focusedQuestion) {
    const grades = await Promise.all(
      orderedStudents.map((s) =>
        gradeService.getGrade(test.id, focusedQuestion.id, s.id),
      ),
    );
    numerator = grades.filter((g) => g !== null).length;
  } else {
    for (const c of cells) {
      const allGraded =
        c.answeredCount > 0 && c.gradedCount >= c.answeredCount;
      if (allGraded) numerator++;
    }
  }
  const progressLabel =
    selection.mode === GradingMode.Question
      ? "students graded"
      : "students fully graded";

  return (
    <TwoPaneShell
      pivot={<PivotToggle mode={selection.mode} basePath={basePath} />}
      progress={
        <GradingProgress
          numerator={numerator}
          denominator={denominator}
          label={progressLabel}
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
