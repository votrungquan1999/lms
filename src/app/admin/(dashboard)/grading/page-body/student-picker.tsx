import { GradingMode } from "src/lib/grading-mode";
import { gradingHref } from "./href";
import { StudentPickerUi } from "./student-picker.ui";
import {
  StudentPickerGroup,
  type StudentPickerRow,
} from "./student-picker-rows";

interface StudentPickerProps {
  rows: StudentPickerRow[];
  currentId: string | null;
  currentName: string | null;
  currentUsername: string | null;
  testTitle: string;
  basePath: string;
  needsOnly?: boolean;
}

/** The student picker for the top bar: builds each row's link, keeping the "Needs grading only" filter. */
export function StudentPicker({
  rows,
  currentId,
  currentName,
  currentUsername,
  testTitle,
  basePath,
  needsOnly,
}: StudentPickerProps) {
  const hrefFor = Object.fromEntries(
    rows.map((row) => [
      row.id,
      gradingHref({
        basePath,
        mode: GradingMode.Student,
        studentId: row.id,
        needsOnly,
      }),
    ]),
  );
  // Needs grading lists the oldest hand-in first, so the first row that is not the open student is next.
  const nextWaiting = rows.find(
    (row) =>
      row.group === StudentPickerGroup.NeedsGrading && row.id !== currentId,
  );
  return (
    <StudentPickerUi
      nextWaitingHref={nextWaiting ? hrefFor[nextWaiting.id] : null}
      currentName={currentName}
      currentUsername={currentUsername}
      testTitle={testTitle}
      rows={rows}
      currentId={currentId}
      hrefFor={hrefFor}
    />
  );
}
