import type { Answer, StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import type { PairGradingResult } from "src/lib/grading-count-service";
import { needsGrade } from "src/lib/needs-grade";
import { isMcQuestionType, type Question } from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";

/** One answer on the grading screen: a student's answer to a question. */
export interface AnswerRef {
  studentId: string;
  questionId: string;
}

export interface NextAnswerInput {
  /** By student walks one student's answers first; By question walks one question's. */
  mode: "student" | "question";
  /** The course's students, in box order. */
  students: { id: string }[];
  /** The answer the teacher just graded. */
  current: AnswerRef;
  /** The test's live questions, in order. */
  questions: Question[];
  /** Each enrolled student's pair result, by student id. */
  pairs: Map<string, PairGradingResult>;
  /** Latest answers: student id, then question id. */
  answers: Map<string, Map<string, Answer>>;
  /** Grades: student id, then question id. */
  grades: Map<string, Map<string, Grade>>;
}

/**
 * A written or photo answer with content; choice answers are graded by the system.
 * @param question - The question answered.
 * @param answer - The student's answer, or undefined when there is none.
 * @returns True when the teacher can grade it.
 */
export function isGradableAnswer(
  question: Pick<Question, "type">,
  answer: StudentAnswer | undefined,
): boolean {
  if (!answer || isMcQuestionType(question.type)) return false;
  return answer.type === "free_text"
    ? answer.text.length > 0
    : answer.type === "image" && answer.mediaKeys.length > 0;
}

function answerNeedsGrade(
  input: NextAnswerInput,
  studentId: string,
  question: Question,
): boolean {
  const answer = input.answers.get(studentId)?.get(question.id);
  return (
    isGradableAnswer(question, answer?.answer) &&
    needsGrade({
      answered: true,
      latestAnswerAt: answer?.submittedAt ?? null,
      grade: input.grades.get(studentId)?.get(question.id) ?? null,
      redoOpen: false,
    })
  );
}

/**
 * Finds the answer Save & next opens: the same student's later answers that
 * need a grade, then her earlier ones, then the first such answer of the
 * oldest waiting student. Still-writing and redo-locked students are never
 * picked as the next student.
 * @param input - The screen's questions, answers and grades, and the answer just graded.
 * @returns The next answer, or null when nothing is left.
 */
export function findNextAnswerToGrade(
  input: NextAnswerInput,
): AnswerRef | null {
  return input.mode === "question"
    ? findNextByQuestion(input)
    : findNextByStudent(input);
}

/** Students whose answers may be picked as next: handed in, no open redo. */
function waitingStudentIds(input: NextAnswerInput): string[] {
  return input.students
    .map((student) => input.pairs.get(student.id))
    .filter(
      (pair): pair is PairGradingResult =>
        pair !== undefined &&
        pair.status === TestStatus.Submitted &&
        !pair.redoRequested,
    )
    .map((pair) => pair.studentId);
}

/** The next student's answer to this question, then the first waiting answer of the next question, wrapping. */
function findNextByQuestion(input: NextAnswerInput): AnswerRef | null {
  const { current, questions } = input;
  const waiting = waitingStudentIds(input);
  const questionAt = questions.findIndex((q) => q.id === current.questionId);
  const studentAt = input.students.findIndex((s) => s.id === current.studentId);
  const order = [
    ...input.students.slice(studentAt + 1),
    ...input.students.slice(0, studentAt + 1),
  ]
    .map((s) => s.id)
    .filter((id) => waiting.includes(id));

  // The current question starts after the current student; the others start at the first box.
  const sameQuestion = order.find((id) =>
    answerNeedsGrade(input, id, questions[questionAt]),
  );
  if (sameQuestion) {
    return { studentId: sameQuestion, questionId: current.questionId };
  }
  const others = [
    ...questions.slice(questionAt + 1),
    ...questions.slice(0, questionAt),
  ];
  for (const question of others) {
    const studentId = input.students
      .map((s) => s.id)
      .filter((id) => waiting.includes(id))
      .find((id) => answerNeedsGrade(input, id, question));
    if (studentId) return { studentId, questionId: question.id };
  }
  return null;
}

/** Handed-in students other than this one who may be picked next, oldest hand-in first. */
function otherWaitingPairs(
  input: NextAnswerInput,
  studentId: string,
): PairGradingResult[] {
  return [...input.pairs.values()]
    .filter(
      (pair) =>
        pair.studentId !== studentId &&
        pair.status === TestStatus.Submitted &&
        !pair.redoRequested,
    )
    .sort(
      (a, b) =>
        (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) ||
        a.studentId.localeCompare(b.studentId),
    );
}

/**
 * The questions whose answer from one student still needs a grade.
 * @param input - The screen's questions, answers and grades.
 * @param studentId - The student whose answers are checked.
 * @returns Those questions, in test order.
 */
export function questionsToGrade(
  input: NextAnswerInput,
  studentId: string,
): Question[] {
  return input.questions.filter((q) => answerNeedsGrade(input, studentId, q));
}

/**
 * How many students other than this one Save & next could take the teacher to.
 * @param input - The screen's questions, answers, grades and pairs.
 * @param studentId - The student on screen.
 * @returns The count of waiting students with an answer to grade.
 */
export function countOtherStudentsToGrade(
  input: NextAnswerInput,
  studentId: string,
): number {
  return otherWaitingPairs(input, studentId).filter(
    (pair) => questionsToGrade(input, pair.studentId).length > 0,
  ).length;
}

function findNextByStudent(input: NextAnswerInput): AnswerRef | null {
  const { current, questions } = input;
  const at = questions.findIndex((q) => q.id === current.questionId);
  const inOrder = [...questions.slice(at + 1), ...questions.slice(0, at)];
  const own = inOrder.find((q) =>
    answerNeedsGrade(input, current.studentId, q),
  );
  if (own) return { studentId: current.studentId, questionId: own.id };

  for (const pair of otherWaitingPairs(input, current.studentId)) {
    const first = questions.find((q) =>
      answerNeedsGrade(input, pair.studentId, q),
    );
    if (first) return { studentId: pair.studentId, questionId: first.id };
  }
  return null;
}
