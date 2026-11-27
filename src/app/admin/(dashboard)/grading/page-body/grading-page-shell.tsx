import { GradingMode } from "src/lib/grading-mode";
import { readGradingScreen } from "src/lib/grading-screen-read";
import { needsGrade } from "src/lib/needs-grade";
import type { Question } from "src/lib/question-service";
import type { Test } from "src/lib/test-service";
import { GradingDetailQuestion } from "./grading-detail-question";
import { GradingDetailStudent } from "./grading-detail-student";
import {
  GradingProgress,
  PivotToggle,
  TwoPaneShell,
} from "./grading-page-shell.ui";
import {
  GradingTopBar,
  QuestionPosition,
  StudentPosition,
} from "./grading-top-bar.ui";
import { gradingHref } from "./href";
import { QuestionPicker } from "./question-picker";
import { StudentRow } from "./question-row";
import { buildStudentBoxes } from "./question-row-state";
import { StillWritingProvider } from "./still-writing-confirm";
import { StudentPicker } from "./student-picker";
import {
  buildStudentPickerRows,
  StudentPickerGroup,
} from "./student-picker-rows";

interface GradingSelection {
  mode: GradingMode;
  studentId?: string;
  questionId?: string;
  needsOnly?: boolean;
}

interface GradingPageShellProps {
  test: Test;
  courseId: string;
  /** The page's school — never resolved here. */
  schoolId: string;
  /** Base URL (no query string) every grading link on the page is built on; also tells Save & next which route it is on. */
  basePath: string;
  /** URL-driven selection. An unknown student opens the oldest waiting one, else the first graded; an unknown question opens the first one (By student: her first answer to grade). */
  selection: GradingSelection;
  /** Controls shown at the right end of the top bar. */
  barActions?: React.ReactNode;
}

/**
 * Grading shell: a top bar over the focused detail. By student puts the
 * student picker and ‹ › in the top bar and the student's full detail below.
 * By question puts the question picker and ‹ › in the top bar and one row
 * per enrolled student for the focused question below.
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

  const pickerRows = buildStudentPickerRows({
    students: orderedStudents,
    pairs: screen.pairs,
    answers: screen.answers,
    questionCount: questions.length,
  });
  const studentByIdLookup = new Map(orderedStudents.map((s) => [s.id, s]));

  // Without a valid ?studentId= the oldest waiting student opens, else the first graded one.
  const requestedId = selection.studentId;
  const defaultRow =
    pickerRows.find((r) => r.group === StudentPickerGroup.NeedsGrading) ??
    pickerRows.find((r) => r.group === StudentPickerGroup.Graded);
  const focused =
    (requestedId && studentByIdLookup.get(requestedId)) ||
    (defaultRow && studentByIdLookup.get(defaultRow.id)) ||
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

  const studentBoxes = buildStudentBoxes({
    rows: pickerRows,
    question: focusedQuestion ?? { id: "", type: "free_text" },
    answers: screen.answers,
    grades: screen.grades,
    isPractice: test.isPractice,
    requestedStudentId: selection.studentId,
  });

  const main =
    selection.mode === GradingMode.Question ? (
      focusedQuestion ? (
        <>
          <StudentRow
            boxes={studentBoxes.boxes}
            currentStudentId={studentBoxes.currentId}
            questionId={focusedQuestion.id}
            testTitle={test.title}
            notStarted={
              pickerRows.filter(
                (r) => r.group === StudentPickerGroup.NotStarted,
              ).length
            }
            basePath={basePath}
            needsOnly={selection.needsOnly ?? false}
          />
          {
            await GradingDetailQuestion({
              test,
              courseId,
              schoolId,
              questionId: focusedQuestion.id,
              students: orderedStudents.map((s) => ({
                id: s.id,
                name: s.name,
                username: s.username,
              })),
              basePath,
            })
          }
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This test has no questions yet.
        </p>
      )
    ) : orderedStudents.length > 0 && questions.length === 0 ? (
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
            needsOnly: selection.needsOnly,
            screen,
          })
        }
      </>
    ) : orderedStudents.length > 0 ? (
      <p className="text-sm text-muted-foreground">Nobody has submitted yet.</p>
    ) : (
      <p className="text-sm text-muted-foreground">
        No students enrolled in this course yet.
      </p>
    );

  // Both modes count students fully graded over the students who handed in.
  const progress = {
    numerator: screen.counts?.fullyGraded ?? 0,
    denominator: screen.counts?.submitted ?? 0,
    label: "fully graded",
  };

  // ‹ › step through the students who handed in, in picker order.
  const submittedIds = pickerRows
    .filter(
      (r) =>
        r.group === StudentPickerGroup.NeedsGrading ||
        r.group === StudentPickerGroup.Graded,
    )
    .map((r) => r.id);
  const focusedIndex = focused ? submittedIds.indexOf(focused.id) : -1;
  const studentHref = (id: string | undefined) =>
    id === undefined
      ? null
      : gradingHref({
          basePath,
          mode: GradingMode.Student,
          studentId: id,
          needsOnly: selection.needsOnly,
        });
  // A student outside the list opens the first one with › and the last with ‹.
  const previousId =
    focusedIndex === -1
      ? submittedIds[submittedIds.length - 1]
      : submittedIds[focusedIndex - 1];
  const nextId =
    focusedIndex === -1 ? submittedIds[0] : submittedIds[focusedIndex + 1];

  // ‹ › step through the questions in order.
  const questionIndex = questions.findIndex(
    (q) => q.id === focusedQuestion?.id,
  );
  const previousQuestion = questions[questionIndex - 1];
  const nextQuestion = questions[questionIndex + 1];
  const questionHref = (question: Question | undefined) =>
    question === undefined
      ? null
      : gradingHref({
          basePath,
          mode: GradingMode.Question,
          questionId: question.id,
          needsOnly: selection.needsOnly,
        });

  return (
    <StillWritingProvider>
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
                needsOnly={selection.needsOnly}
              />
            }
            position={
              selection.mode === GradingMode.Student ? (
                <StudentPosition
                  picker={
                    <StudentPicker
                      rows={pickerRows}
                      currentId={focused?.id ?? null}
                      currentName={focused?.name ?? null}
                      currentUsername={focused?.username ?? null}
                      testTitle={test.title}
                      basePath={basePath}
                      needsOnly={selection.needsOnly}
                    />
                  }
                  index={focusedIndex === -1 ? null : focusedIndex + 1}
                  submittedCount={submittedIds.length}
                  previousHref={studentHref(previousId)}
                  nextHref={studentHref(nextId)}
                />
              ) : (
                <QuestionPosition
                  previousHref={questionHref(previousQuestion)}
                  nextHref={questionHref(nextQuestion)}
                  picker={
                    <QuestionPicker
                      questions={questions}
                      current={focusedQuestion}
                      basePath={basePath}
                      needsOnly={selection.needsOnly}
                    />
                  }
                />
              )
            }
            progress={<GradingProgress {...progress} />}
            actions={barActions}
          />
        }
        roster={null}
        main={main}
        fillScreen={selection.mode === GradingMode.Student}
      />
    </StillWritingProvider>
  );
}
