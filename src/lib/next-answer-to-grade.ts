import type { Answer, StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import type { PairGradingResult } from "src/lib/grading-count-service";
import { GradingMode } from "src/lib/grading-mode";
import { type NeedsGradeInput, needsGrade } from "src/lib/needs-grade";
import { isMcQuestionType, type Question } from "src/lib/question-service";
import { hasSubmitted, TestStatus } from "src/lib/test-status-service";

/** One student's answer to one question and the grade it has. */
export interface AnswerNeedsGradeInput {
  question: Pick<Question, "type">;
  /** The student's latest answer, or undefined when there is none. */
  answer: StudentAnswer | undefined;
  /** When that answer was saved. */
  answeredAt: Date | null;
  /** The saved grade, or null when there is none. */
  grade: NeedsGradeInput["grade"];
  /** The student has an open redo request. */
  redoOpen: boolean;
}

/** One answer on the grading screen: a student's answer to a question. */
export interface AnswerRef {
  studentId: string;
  questionId: string;
}

export interface NextAnswerInput {
  /** By student walks one student's answers first; By question walks one question's. */
  mode: GradingMode;
  /** The course's enrolled students; their order does not matter. */
  students: { id: string }[];
  /** The answer the teacher just graded. */
  current: AnswerRef;
  /**
   * By question: the student on screen was waiting (Needs grading) before this
   * save, so the walk starts after her box. Defaults to what `pairs` says.
   */
  currentWasWaiting?: boolean;
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
    ? answer.text.trim() !== ""
    : answer.type === "image" && answer.mediaKeys.length > 0;
}

/**
 * A choice answer with a selection and no grade: the system marks choice answers at hand-in, so this one's marking never ran.
 * @param question - The question answered.
 * @param answer - The student's answer, or undefined when there is none.
 * @param grade - The saved grade, or undefined / null when there is none.
 * @returns True when the answer is waiting for its automatic mark.
 */
export function isUnmarkedChoiceAnswer(
  question: Pick<Question, "type">,
  answer: StudentAnswer | undefined,
  grade: object | null | undefined,
): boolean {
  return (
    isMcQuestionType(question.type) &&
    answer?.type === "mc" &&
    answer.selectedIds.length > 0 &&
    !grade
  );
}

/**
 * Whether an answer the teacher can grade still waits for a grade. The one
 * rule every grading screen part and the AI grading round use to decide.
 * @param input - The question, the answer and its grade.
 * @returns True when the answer is gradable and has no grade or a stale one.
 */
export function answerNeedsGrade(input: AnswerNeedsGradeInput): boolean {
  return (
    isGradableAnswer(input.question, input.answer) &&
    needsGrade({
      answered: true,
      latestAnswerAt: input.answeredAt,
      grade: input.grade,
      redoOpen: input.redoOpen,
    })
  );
}

/** Whether this student's answer to the question is somewhere the teacher has to go: it waits for a grade, or it is a handed-in choice answer whose Mark button is the only way forward. */
function answerOfStudentNeedsGrade(
  input: NextAnswerInput,
  studentId: string,
  question: Question,
): boolean {
  const answer = input.answers.get(studentId)?.get(question.id);
  const grade = input.grades.get(studentId)?.get(question.id) ?? null;
  const pair = input.pairs.get(studentId);
  return (
    answerNeedsGrade({
      question,
      answer: answer?.answer,
      answeredAt: answer?.submittedAt ?? null,
      grade,
      redoOpen: false,
    }) ||
    // A still-writing student's choice answer has no mark until she hands in.
    (pair !== undefined &&
      hasSubmitted(pair.status) &&
      isUnmarkedChoiceAnswer(question, answer?.answer, grade))
  );
}

/**
 * Finds the answer Save & next opens. By student: the same student's later
 * answers that need a grade, then her earlier ones, then the first such answer
 * of the oldest waiting student. By question: the next box on this question,
 * then the first waiting box of the next question. Still-writing and
 * redo-locked students are never picked as the next student.
 * @param input - The screen's questions, answers and grades, and the answer just graded.
 * @returns The next answer, or null when nothing is left.
 */
export function findNextAnswerToGrade(
  input: NextAnswerInput,
): AnswerRef | null {
  return input.mode === GradingMode.Question
    ? findNextByQuestion(input)
    : findNextByStudent(input);
}

/** Handed-in students with no open redo, in the picker's Needs grading order: oldest hand-in first. */
function waitingPairs(input: NextAnswerInput): PairGradingResult[] {
  const enrolled = new Set(input.students.map((student) => student.id));
  return [...input.pairs.values()]
    .filter(
      (pair) =>
        enrolled.has(pair.studentId) &&
        pair.status === TestStatus.Submitted &&
        !pair.redoRequested,
    )
    .sort(byHandIn);
}

/** Oldest hand-in first, then by id, as the student picker lists Needs grading. */
function byHandIn(a: PairGradingResult, b: PairGradingResult): number {
  return (
    (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) ||
    a.studentId.localeCompare(b.studentId)
  );
}

/** The next box on this question in box order, wrapping, then the first waiting box of the next question. */
function findNextByQuestion(input: NextAnswerInput): AnswerRef | null {
  const { current, questions } = input;
  const waiting = waitingPairs(input);
  const questionAt = questions.findIndex((q) => q.id === current.questionId);
  const currentPair = input.pairs.get(current.studentId);
  const wasWaiting =
    input.currentWasWaiting ??
    waiting.some((pair) => pair.studentId === current.studentId);

  // A waiting student's box sits among the waiting boxes; any other box comes after them all.
  const isAfterCurrent = (pair: PairGradingResult) =>
    wasWaiting && currentPair !== undefined && byHandIn(pair, currentPair) > 0;
  const others = waiting.filter((pair) => pair.studentId !== current.studentId);
  const sameQuestion = [
    ...others.filter(isAfterCurrent),
    ...others.filter((pair) => !isAfterCurrent(pair)),
  ].find((pair) =>
    answerOfStudentNeedsGrade(input, pair.studentId, questions[questionAt]),
  );
  if (sameQuestion) {
    return {
      studentId: sameQuestion.studentId,
      questionId: current.questionId,
    };
  }
  const laterQuestions = [
    ...questions.slice(questionAt + 1),
    ...questions.slice(0, questionAt),
  ];
  for (const question of laterQuestions) {
    const first = waiting.find((pair) =>
      answerOfStudentNeedsGrade(input, pair.studentId, question),
    );
    if (first) return { studentId: first.studentId, questionId: question.id };
  }
  return null;
}

/** Handed-in students other than this one who may be picked next, oldest hand-in first. */
function otherWaitingPairs(
  input: NextAnswerInput,
  studentId: string,
): PairGradingResult[] {
  return waitingPairs(input).filter((pair) => pair.studentId !== studentId);
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
  return input.questions.filter((q) =>
    answerOfStudentNeedsGrade(input, studentId, q),
  );
}

/**
 * How many waiting students still have an answer to this question to grade.
 * @param input - The screen's questions, answers, grades and pairs.
 * @param questionId - The question on screen.
 * @returns The count, including the student on screen while her answer waits.
 */
export function countStudentsToGradeOnQuestion(
  input: NextAnswerInput,
  questionId: string,
): number {
  const question = input.questions.find((q) => q.id === questionId);
  if (!question) return 0;
  return waitingPairs(input).filter((pair) =>
    answerOfStudentNeedsGrade(input, pair.studentId, question),
  ).length;
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

/** By student: this student's next waiting answer, then the next waiting student's first. */
function findNextByStudent(input: NextAnswerInput): AnswerRef | null {
  const { current, questions } = input;
  const at = questions.findIndex((q) => q.id === current.questionId);
  const inOrder = [...questions.slice(at + 1), ...questions.slice(0, at)];
  const own = inOrder.find((q) =>
    answerOfStudentNeedsGrade(input, current.studentId, q),
  );
  if (own) return { studentId: current.studentId, questionId: own.id };

  for (const pair of otherWaitingPairs(input, current.studentId)) {
    const first = questions.find((q) =>
      answerOfStudentNeedsGrade(input, pair.studentId, q),
    );
    if (first) return { studentId: pair.studentId, questionId: first.id };
  }
  return null;
}
