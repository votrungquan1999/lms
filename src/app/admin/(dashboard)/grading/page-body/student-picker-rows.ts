import type { Answer } from "src/lib/answer-service";
import type { PairGradingResult } from "src/lib/grading-count-service";
import { TestStatus } from "src/lib/test-status-service";

export enum StudentPickerGroup {
  NeedsGrading = "needs-grading",
  Graded = "graded",
  StillWriting = "still-writing",
  RedoRequested = "redo-requested",
  NotStarted = "not-started",
}

/** Groups in the order the picker lists them. */
export const STUDENT_PICKER_GROUPS: StudentPickerGroup[] = [
  StudentPickerGroup.NeedsGrading,
  StudentPickerGroup.Graded,
  StudentPickerGroup.StillWriting,
  StudentPickerGroup.RedoRequested,
  StudentPickerGroup.NotStarted,
];

export interface StudentPickerRow {
  id: string;
  name: string;
  username: string;
  group: StudentPickerGroup;
  /** A short fact shown beside the name, or null. */
  detail: string | null;
  /** False for a student there is nothing to open for. */
  openable: boolean;
}

interface BuildRowsInput {
  /** The course's students; their order does not matter. */
  students: { id: string; name: string; username: string }[];
  pairs: Map<string, PairGradingResult>;
  /** Latest answers: student id, then question id. */
  answers: Map<string, Map<string, Answer>>;
  questionCount: number;
}

function groupOf(pair: PairGradingResult | undefined): StudentPickerGroup {
  if (pair?.redoRequested) return StudentPickerGroup.RedoRequested;
  switch (pair?.status) {
    case TestStatus.Submitted:
      return StudentPickerGroup.NeedsGrading;
    case TestStatus.Graded:
      return StudentPickerGroup.Graded;
    case TestStatus.InProgress:
      return StudentPickerGroup.StillWriting;
    default:
      return StudentPickerGroup.NotStarted;
  }
}

/**
 * The picker's rows in listing order: groups in a fixed order, Needs grading
 * oldest hand-in first, every other group by name then id.
 * @param input - The students and what the screen knows about each.
 * @returns One row per student.
 */
export function buildStudentPickerRows(
  input: BuildRowsInput,
): StudentPickerRow[] {
  const rows = input.students.map((student) => {
    const pair = input.pairs.get(student.id);
    const group = groupOf(pair);
    const saved = input.answers.get(student.id)?.size ?? 0;
    return {
      row: {
        id: student.id,
        name: student.name,
        username: student.username,
        group,
        detail:
          group === StudentPickerGroup.NeedsGrading
            ? `${pair?.answersLeft ?? 0} left`
            : group === StudentPickerGroup.StillWriting
              ? saved > 0
                ? `${saved} of ${input.questionCount} saved`
                : "nothing saved yet"
              : null,
        openable:
          group === StudentPickerGroup.StillWriting
            ? saved > 0
            : group !== StudentPickerGroup.NotStarted,
      },
      submittedAt: pair?.submittedAt?.getTime() ?? 0,
    };
  });

  const groupRank = (group: StudentPickerGroup) =>
    STUDENT_PICKER_GROUPS.indexOf(group);
  return rows
    .sort(
      (a, b) =>
        groupRank(a.row.group) - groupRank(b.row.group) ||
        (a.row.group === StudentPickerGroup.NeedsGrading
          ? a.submittedAt - b.submittedAt
          : a.row.name.localeCompare(b.row.name)) ||
        a.row.id.localeCompare(b.row.id),
    )
    .map(({ row }) => row);
}

/** Lowercase, accents and Vietnamese đ folded away, so "tam" finds "Tâm". */
function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

/**
 * Whether a typed search matches a student's name or @username.
 * @param row - The picker row.
 * @param query - What the teacher typed; a leading @ is ignored.
 * @returns True when the query is empty or found in the name or username.
 */
export function matchesPickerSearch(
  row: Pick<StudentPickerRow, "name" | "username">,
  query: string,
): boolean {
  const needle = foldForSearch(query.trim().replace(/^@/, ""));
  return (
    needle === "" ||
    foldForSearch(row.name).includes(needle) ||
    foldForSearch(row.username).includes(needle)
  );
}
