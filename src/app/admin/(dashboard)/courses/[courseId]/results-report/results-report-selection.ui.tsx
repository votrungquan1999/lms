"use client";

import { useRouter } from "next/navigation";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { buildResultsReportDownloadHref } from "./href";
import { useResultsReportSelection } from "./results-report-selection.state";

/**
 * The student single-choice list for the results-report export view.
 */
export function StudentChoiceList(): React.ReactNode {
  const { students, selectedStudentId, selectStudent } =
    useResultsReportSelection();

  return (
    <RadioGroup
      value={selectedStudentId ?? ""}
      onValueChange={selectStudent}
      className="space-y-2"
    >
      {students.map((student) => (
        <div key={student.id} className="flex items-center gap-2">
          <RadioGroupItem value={student.id} id={`student-${student.id}`} />
          <Label htmlFor={`student-${student.id}`}>{student.name}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/**
 * The test multi-choice (checkbox) list for the results-report export view.
 */
export function TestChoiceList(): React.ReactNode {
  const { tests, selectedTestIds, toggleTest } = useResultsReportSelection();

  return (
    <div className="space-y-2">
      {tests.map((test) => (
        <div key={test.id} className="flex items-center gap-2">
          <Checkbox
            id={`test-${test.id}`}
            checked={selectedTestIds.includes(test.id)}
            onCheckedChange={() => toggleTest(test.id)}
          />
          <Label htmlFor={`test-${test.id}`}>{test.title}</Label>
        </div>
      ))}
    </div>
  );
}

/**
 * The Export control. Hard-blocked until a student and >=1 test are selected;
 * navigates to the download route when enabled and clicked.
 */
export function ExportButton(): React.ReactNode {
  const router = useRouter();
  const { courseId, selectedStudentId, selectedTestIds } =
    useResultsReportSelection();

  const isReady = selectedStudentId !== null && selectedTestIds.length > 0;

  function handleExport() {
    if (!isReady || selectedStudentId === null) return;
    router.push(
      buildResultsReportDownloadHref(
        courseId,
        selectedStudentId,
        selectedTestIds,
      ),
    );
  }

  return (
    <Button type="button" disabled={!isReady} onClick={handleExport}>
      Export PDF
    </Button>
  );
}
