import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import { GradingMode } from "src/lib/grading-mode";
import type { Question } from "src/lib/question-service";
import type { GradingSort } from "./grading-page-body.type";
import { gradingHref } from "./href";
import { QuestionRowUi } from "./question-row.ui";
import {
  countBoxStates,
  QuestionBoxState,
  questionBoxState,
} from "./question-row-state";

interface QuestionRowProps {
  /** The test's live questions in order. */
  questions: Question[];
  studentId: string;
  currentQuestionId: string;
  answers: Map<string, StudentAnswer>;
  grades: Map<string, Grade>;
  /** The student's test is handed in. */
  handedIn: boolean;
  isPractice: boolean;
  basePath: string;
  sort?: GradingSort;
  needsOnly: boolean;
}

/** The question number row for one student: every live question's state, with a link to open it. */
export function QuestionRow({
  questions,
  studentId,
  currentQuestionId,
  answers,
  grades,
  handedIn,
  isPractice,
  basePath,
  sort,
  needsOnly,
}: QuestionRowProps) {
  const boxes = questions.map((question) => ({
    questionId: question.id,
    order: question.order,
    state: questionBoxState({
      question,
      answered: answers.has(question.id),
      grade: grades.get(question.id),
      handedIn,
      isPractice,
    }),
    href: gradingHref({
      basePath,
      mode: GradingMode.Student,
      studentId,
      questionId: question.id,
      sort,
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
      counts={countBoxStates(boxes.map((box) => box.state))}
      needsOnly={needsOnly}
      toggleHref={gradingHref({
        basePath,
        mode: GradingMode.Student,
        studentId,
        questionId: currentQuestionId,
        sort,
        needsOnly: !needsOnly,
      })}
      nothingNeedsGrading={
        !boxes.some((box) => box.state === QuestionBoxState.NeedsGrade)
      }
    />
  );
}
