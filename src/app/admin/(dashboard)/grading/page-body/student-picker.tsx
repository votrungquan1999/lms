import { GradingMode } from "src/lib/grading-mode";
import { gradingHref } from "./href";
import { StudentPickerUi } from "./student-picker.ui";
import type { StudentPickerRow } from "./student-picker-rows";

interface StudentPickerProps {
  rows: StudentPickerRow[];
  currentId: string | null;
  currentName: string | null;
  basePath: string;
  needsOnly?: boolean;
}

/** The student picker for the top bar: builds each row's link, keeping the "Needs grading only" filter. */
export function StudentPicker({
  rows,
  currentId,
  currentName,
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
  return (
    <StudentPickerUi
      currentName={currentName}
      rows={rows}
      currentId={currentId}
      hrefFor={hrefFor}
    />
  );
}
