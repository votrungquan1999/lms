/** What the grading screen knows about one student's answer to one question. */
export interface NeedsGradeInput {
  /** The student has an answer on a live question. */
  answered: boolean;
  /** When the student's latest answer was saved. */
  latestAnswerAt: Date | null;
  /** The saved grade, or null when there is none. */
  grade: { gradedAt: Date; updatedAt?: Date | null } | null;
  /** The student has an open redo request. */
  redoOpen: boolean;
}

/**
 * Whether an answer still waits for the teacher's grade. The one rule the
 * default question, the number row, the next-answer search and the picker share.
 * @param input - The answer and its grade.
 * @returns True when the student answered and no grade is saved.
 */
export function needsGrade(input: NeedsGradeInput): boolean {
  return input.answered && input.grade === null;
}
