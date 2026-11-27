import { needsGrade } from "src/lib/needs-grade";
import { isMcQuestionType, type Question } from "src/lib/question-service";

export enum QuestionBoxState {
  /** Nothing to say yet: not handed in, or a choice answer awaiting hand-in. */
  Plain = "plain",
  Correct = "correct",
  PartlyRight = "partly-right",
  Wrong = "wrong",
  /** A written or photo answer the teacher graded. */
  Graded = "graded",
  NeedsGrade = "needs-grade",
  /** Handed in with no answer. */
  Blank = "blank",
  /** Practice tests only show whether an answer exists. */
  Answered = "answered",
}

interface QuestionBoxInput {
  question: Pick<Question, "type">;
  /** The student has an answer to this question. */
  answered: boolean;
  /** The saved grade, or undefined when there is none. */
  grade: { score: number; gradedAt: Date; updatedAt?: Date | null } | undefined;
  /** The student's test is handed in. */
  handedIn: boolean;
  isPractice: boolean;
}

/**
 * The state one question's box shows for one student.
 * @param input - The question, the student's answer and grade, and how far along the test is.
 * @returns The box state.
 */
export function questionBoxState(input: QuestionBoxInput): QuestionBoxState {
  const { question, answered, grade, handedIn, isPractice } = input;
  if (isPractice) {
    if (answered) return QuestionBoxState.Answered;
    return handedIn ? QuestionBoxState.Blank : QuestionBoxState.Plain;
  }
  const isChoice = isMcQuestionType(question.type);

  if (!answered) {
    if (!handedIn) return QuestionBoxState.Plain;
    // A grade left on a blank written answer still counts as graded.
    return grade && !isChoice
      ? QuestionBoxState.Graded
      : QuestionBoxState.Blank;
  }

  if (isChoice) {
    // The system grades choice answers at hand-in, so the box shows its score.
    if (!handedIn || !grade) return QuestionBoxState.Plain;
    if (grade.score >= 100) return QuestionBoxState.Correct;
    return grade.score > 0
      ? QuestionBoxState.PartlyRight
      : QuestionBoxState.Wrong;
  }

  const waiting = needsGrade({
    answered,
    latestAnswerAt: null,
    grade: grade ?? null,
    redoOpen: false,
  });
  return waiting ? QuestionBoxState.NeedsGrade : QuestionBoxState.Graded;
}

/**
 * How many boxes are in each state.
 * @param states - One state per live question.
 * @returns A count for every state, zero when none.
 */
export function countBoxStates(
  states: QuestionBoxState[],
): Record<QuestionBoxState, number> {
  const counts = Object.fromEntries(
    Object.values(QuestionBoxState).map((state) => [state, 0]),
  ) as Record<QuestionBoxState, number>;
  for (const state of states) counts[state] += 1;
  return counts;
}
