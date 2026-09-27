"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { buildCourseDetailHref } from "../href";
import { buildResultsReportDownloadHref } from "./href";
import { useResultsReportSelection } from "./results-report-selection.state";

/**
 * The student single-choice list for the results-report export view.
 */
export function StudentChoiceList(): React.ReactNode {
  const { courseId, students, selectedStudentId, selectStudent } =
    useResultsReportSelection();

  if (students.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={buildCourseDetailHref(courseId)}
          className="underline hover:no-underline"
        >
          No students enrolled yet
        </Link>
      </p>
    );
  }

  return (
    <RadioGroup
      value={selectedStudentId ?? ""}
      onValueChange={selectStudent}
      className="space-y-2"
    >
      {students.map((student) => (
        <div key={student.id} className="flex items-center gap-2">
          <RadioGroupItem value={student.id} id={`student-${student.id}`} />
          <Label
            htmlFor={`student-${student.id}`}
            className="min-w-0 wrap-anywhere"
          >
            {student.name}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/**
 * The test multi-choice (checkbox) list for the results-report export view.
 */
export function TestChoiceList(): React.ReactNode {
  const { courseId, tests, selectedTestIds, toggleTest } =
    useResultsReportSelection();

  if (tests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={buildCourseDetailHref(courseId)}
          className="underline hover:no-underline"
        >
          No tests yet
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {tests.map((test) => (
        <div key={test.id} className="flex items-center gap-2">
          <Checkbox
            id={`test-${test.id}`}
            checked={selectedTestIds.includes(test.id)}
            onCheckedChange={() => toggleTest(test.id)}
          />
          <Label htmlFor={`test-${test.id}`} className="min-w-0 wrap-anywhere">
            {test.title}
          </Label>
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
    <div className="space-y-2">
      <Button type="button" disabled={!isReady} onClick={handleExport}>
        Export PDF
      </Button>
      {!isReady && (
        <p className="text-sm text-muted-foreground">
          Pick a student and at least one test
        </p>
      )}
    </div>
  );
}
