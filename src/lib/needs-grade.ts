/** What the grading screen knows about one student's answer to one question. */
export interface NeedsGradeInput {
  /** The student has an answer on a live question. */
  answered: boolean;
  /** When the student's latest answer was saved. */
  latestAnswerAt: Date | null;
  /** The saved grade, or null when there is none. */
  grade: {
    gradedAt: Date;
    updatedAt?: Date | null;
    /** When the answer this grade describes was saved; absent on grades that never recorded it. */
    gradedAnswerAt?: Date;
  } | null;
  /** The student has an open redo request. */
  redoOpen: boolean;
}

/**
 * Whether an answer still waits for the teacher's grade. The one rule the
 * default question, the number row, the next-answer search, the picker, the
 * status and the school counts share.
 * @param input - The answer and its grade.
 * @returns True when the student answered and either no grade is saved or the answer is newer than the one its grade describes.
 */
export function needsGrade(input: NeedsGradeInput): boolean {
  if (!input.answered) return false;
  if (input.grade === null) return true;
  // While a redo is open her edits wait for the hand-in.
  if (input.redoOpen || input.latestAnswerAt === null) return false;
  // A grade without the answer it describes falls back to when it was saved.
  const gradeAt =
    input.grade.gradedAnswerAt ?? input.grade.updatedAt ?? input.grade.gradedAt;
  return input.latestAnswerAt.getTime() > gradeAt.getTime();
}
