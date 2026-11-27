import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import { GradingMode } from "src/lib/grading-mode";
import type { Question } from "src/lib/question-service";
import { gradingHref } from "./href";
import { QuestionRowUi } from "./question-row.ui";
import {
  countBoxStates,
  QuestionBoxState,
  questionBoxState,
  type StudentBoxData,
} from "./question-row-state";

interface QuestionRowProps {
  /** The test's live questions in order. */
  questions: Question[];
  studentId: string;
  currentQuestionId: string;
  answers: Map<string, StudentAnswer>;
  /** When each question's latest answer was saved. */
  answerSavedAt: Map<string, Date>;
  grades: Map<string, Grade>;
  /** The student's test is handed in. */
  handedIn: boolean;
  /** The student has an open redo request. */
  redoOpen: boolean;
  isPractice: boolean;
  basePath: string;
  needsOnly: boolean;
}

/** The question number row for one student: every live question's state, with a link to open it. */
export function QuestionRow({
  questions,
  studentId,
  currentQuestionId,
  answers,
  answerSavedAt,
  grades,
  handedIn,
  redoOpen,
  isPractice,
  basePath,
  needsOnly,
}: QuestionRowProps) {
  const boxes = questions.map((question) => ({
    id: question.id,
    text: String(question.order),
    label: `Q${question.order}`,
    state: questionBoxState({
      question,
      answered: answers.has(question.id),
      latestAnswerAt: answerSavedAt.get(question.id),
      grade: grades.get(question.id),
      handedIn,
      redoOpen,
      isPractice,
    }),
    href: gradingHref({
      basePath,
      mode: GradingMode.Student,
      studentId,
      questionId: question.id,
      needsOnly,
    }),
    current: question.id === currentQuestionId,
  }));
  return (
    <QuestionRowUi
      boxes={
        needsOnly
          ? boxes.filter(
              (box) => box.current || box.state === QuestionBoxState.NeedsGrade,
            )
          : boxes
      }
      // Counts stay over every question so the legend does not shift with the filter.
      legend={legendOf(countBoxStates(boxes.map((box) => box.state)))}
      needsOnly={needsOnly}
      toggleHref={gradingHref({
        basePath,
        mode: GradingMode.Student,
        studentId,
        questionId: currentQuestionId,
        needsOnly: !needsOnly,
      })}
      nothingNeedsGrading={
        !boxes.some((box) => box.state === QuestionBoxState.NeedsGrade)
      }
    />
  );
}

function legendOf(counts: Record<QuestionBoxState, number>): string {
  return `Correct ${counts[QuestionBoxState.Correct]} · Wrong ${counts[QuestionBoxState.Wrong]} · Partly right ${counts[QuestionBoxState.PartlyRight]} · Graded by you ${counts[QuestionBoxState.Graded]} · Needs grade ${counts[QuestionBoxState.NeedsGrade]} · Blank ${counts[QuestionBoxState.Blank]}`;
}

interface StudentRowProps {
  boxes: StudentBoxData[];
  currentStudentId: string | null;
  questionId: string;
  testTitle: string;
  /** Students without a box because they have not started. */
  notStarted: number;
  basePath: string;
  needsOnly: boolean;
}

/** The student row of By question: one box per student for the question on screen. */
export function StudentRow({
  boxes,
  currentStudentId,
  questionId,
  testTitle,
  notStarted,
  basePath,
  needsOnly,
}: StudentRowProps) {
  const models = boxes.map(({ row, state }) => ({
    id: row.id,
    text: initialsOf(row.name),
    label: row.name,
    state,
    href:
      state === QuestionBoxState.RedoRequested ||
      (state === QuestionBoxState.StillWriting && !row.openable)
        ? null
        : gradingHref({
            basePath,
            mode: GradingMode.Question,
            studentId: row.id,
            questionId,
            needsOnly,
          }),
    current: row.id === currentStudentId,
    askStudent: state === QuestionBoxState.StillWriting ? row : undefined,
  }));
  const counts = countBoxStates(boxes.map((box) => box.state));
  return (
    <QuestionRowUi
      boxes={
        needsOnly
          ? models.filter(
              (box) => box.current || box.state === QuestionBoxState.NeedsGrade,
            )
          : models
      }
      legend={`Graded by you ${counts[QuestionBoxState.Graded]} · Needs grade ${counts[QuestionBoxState.NeedsGrade]} · Still writing ${counts[QuestionBoxState.StillWriting]} · Redo requested ${counts[QuestionBoxState.RedoRequested]} · Blank ${counts[QuestionBoxState.Blank]}`}
      needsOnly={needsOnly}
      toggleHref={gradingHref({
        basePath,
        mode: GradingMode.Question,
        studentId: currentStudentId ?? undefined,
        questionId,
        needsOnly: !needsOnly,
      })}
      nothingNeedsGrading={
        !models.some((box) => box.state === QuestionBoxState.NeedsGrade)
      }
      notStarted={notStarted}
      testTitle={testTitle}
    />
  );
}

/** A student's initials: the first letters of her first and last name. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
