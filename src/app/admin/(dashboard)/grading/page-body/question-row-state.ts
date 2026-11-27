import type { Answer, StudentAnswer } from "src/lib/answer-service";
import { answerNeedsGrade } from "src/lib/next-answer-to-grade";
import { isMcQuestionType, type Question } from "src/lib/question-service";
import {
  StudentPickerGroup,
  type StudentPickerRow,
} from "./student-picker-rows";

/** One student's box in By question. */
export interface StudentBoxData {
  row: StudentPickerRow;
  state: QuestionBoxState;
}

interface StudentBoxesInput {
  /** The picker's rows, in picker order. */
  rows: StudentPickerRow[];
  question: Pick<Question, "id" | "type">;
  /** Latest answers: student id, then question id. */
  answers: Map<string, Map<string, Answer>>;
  /** Grades: student id, then question id. */
  grades: Map<
    string,
    Map<
      string,
      {
        score: number;
        gradedAt: Date;
        updatedAt?: Date | null;
        gradedAnswerAt?: Date;
      }
    >
  >;
  isPractice: boolean;
  /** The student asked for in the URL, if any. */
  requestedStudentId?: string;
}

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
  /** By question only: the student has not handed in. */
  StillWriting = "still-writing",
  /** By question only: the student has an open redo and cannot be graded. */
  RedoRequested = "redo-requested",
}

interface QuestionBoxInput {
  question: Pick<Question, "type">;
  /** The student's latest answer to this question, or undefined when there is none. */
  answer: StudentAnswer | undefined;
  /** When the student's latest answer was saved; omitted when not known. */
  latestAnswerAt?: Date | null;
  /** The student has an open redo, so her edits wait for the hand-in. */
  redoOpen?: boolean;
  /** The saved grade, or undefined when there is none. */
  grade:
    | {
        score: number;
        gradedAt: Date;
        updatedAt?: Date | null;
        gradedAnswerAt?: Date;
      }
    | undefined;
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
  const { question, answer, grade, handedIn, isPractice } = input;
  const answered = answer !== undefined;
  const latestAnswerAt = input.latestAnswerAt ?? null;
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

  const waiting = answerNeedsGrade({
    question,
    answer,
    answeredAt: latestAnswerAt,
    grade: grade ?? null,
    redoOpen: input.redoOpen ?? false,
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

/**
 * The boxes of By question's student row and the student on screen. Students
 * who have not started have no box.
 * @param input - The picker rows and what each student answered and was graded on the question.
 * @returns The boxes in picker order and the open student: the one asked for, else the first who needs a grade on this question, else the first openable box.
 */
export function buildStudentBoxes(input: StudentBoxesInput): {
  boxes: StudentBoxData[];
  currentId: string | null;
} {
  const boxes: StudentBoxData[] = [];
  for (const row of input.rows) {
    if (row.group === StudentPickerGroup.NotStarted) continue;
    const state =
      row.group === StudentPickerGroup.StillWriting
        ? QuestionBoxState.StillWriting
        : row.group === StudentPickerGroup.RedoRequested
          ? QuestionBoxState.RedoRequested
          : questionBoxState({
              question: input.question,
              answer: input.answers.get(row.id)?.get(input.question.id)?.answer,
              latestAnswerAt: input.answers.get(row.id)?.get(input.question.id)
                ?.submittedAt,
              grade: input.grades.get(row.id)?.get(input.question.id),
              handedIn: true,
              isPractice: input.isPractice,
            });
    boxes.push({ row, state });
  }
  const opens = (box: StudentBoxData) =>
    box.state !== QuestionBoxState.RedoRequested;
  const current =
    boxes.find(
      (box) => box.row.id === input.requestedStudentId && opens(box),
    ) ??
    boxes.find((box) => box.state === QuestionBoxState.NeedsGrade) ??
    boxes.find(opens);
  return { boxes, currentId: current?.row.id ?? null };
}
