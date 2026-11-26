"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { buildCourseDetailHref, buildCourseStudentsHref } from "../href";
import { buildResultsReportDownloadHref } from "./href";
import { useResultsReportSelection } from "./results-report-selection.state";

/**
 * The student single-choice list for the results-report export view.
 */
export function StudentChoiceList({
  labelledBy,
}: {
  labelledBy: string;
}): React.ReactNode {
  const { courseId, students, selectedStudentId, selectStudent } =
    useResultsReportSelection();

  if (students.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={buildCourseStudentsHref(courseId)}
          className="underline hover:no-underline"
        >
          No students enrolled yet
        </Link>
      </p>
    );
  }

  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={selectedStudentId ?? ""}
      onValueChange={selectStudent}
      className="gap-0.5"
    >
      {students.map((student) => (
        <Label
          key={student.id}
          htmlFor={`student-${student.id}`}
          className="min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 font-normal hover:bg-muted/50 has-[[data-state=checked]]:bg-muted"
        >
          <RadioGroupItem value={student.id} id={`student-${student.id}`} />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-medium">{student.name}</span>{" "}
            <span className="text-sm text-muted-foreground">
              @{student.username}
            </span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

/**
 * The test multi-choice (checkbox) list for the results-report export view.
 */
export function TestChoiceList({
  labelledBy,
}: {
  labelledBy: string;
}): React.ReactNode {
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
    <fieldset
      aria-labelledby={labelledBy}
      className="m-0 grid min-w-0 gap-0.5 border-0 p-0 lg:grid-cols-2"
    >
      {tests.map((test) => (
        <Label
          key={test.id}
          htmlFor={`test-${test.id}`}
          className="min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 font-normal hover:bg-muted/50 has-[[data-state=checked]]:bg-muted"
        >
          <Checkbox
            id={`test-${test.id}`}
            checked={selectedTestIds.includes(test.id)}
            onCheckedChange={() => toggleTest(test.id)}
          />
          <span className="min-w-0 wrap-anywhere">{test.title}</span>
        </Label>
      ))}
    </fieldset>
  );
}

/**
 * The Export card. Hard-blocked until a student and >=1 test are selected;
 * navigates to the download route when enabled and clicked.
 */
export function ExportButton(): React.ReactNode {
  const router = useRouter();
  const { courseId, students, selectedStudentId, selectedTestIds } =
    useResultsReportSelection();

  const isReady = selectedStudentId !== null && selectedTestIds.length > 0;
  const studentName = students.find((s) => s.id === selectedStudentId)?.name;

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
    <section
      aria-label="Export"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card p-4"
    >
      <Button type="button" disabled={!isReady} onClick={handleExport}>
        Export PDF
      </Button>
      <div className="min-w-0 flex-1 basis-60 space-y-1 text-sm text-muted-foreground">
        <p>
          One PDF for {studentName ?? "the student you pick"} with a section per
          ticked test: overall score, status and feedback, then every question
          with the answer, score and feedback. Answers not graded yet show as
          Pending.
        </p>
        {!isReady && <p>Pick a student and at least one test</p>}
      </div>
    </section>
  );
}
