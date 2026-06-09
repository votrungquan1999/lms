"use client";

import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useBulkImport } from "./bulk-import-dialog.state";
import { ImportStage } from "./bulk-import-dialog.type";

/**
 * File picker stage: choose a roster file; shows a format error if unusable.
 */
export function BulkImportFilePicker(): React.ReactNode {
  const { selectFile, formatError, isBusy } = useBulkImport();

  return (
    <div className="space-y-3">
      <Label htmlFor="bulk-import-file">Roster file (.csv or .xlsx)</Label>
      <Input
        id="bulk-import-file"
        type="file"
        accept=".csv,.xlsx"
        disabled={isBusy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) selectFile(file);
        }}
      />
      <p className="text-sm text-muted-foreground">
        Columns: name, username, password. Up to 200 students.
      </p>
      {formatError && (
        <div
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {formatError}
        </div>
      )}
    </div>
  );
}

/**
 * Preview stage: per-row statuses, summary, optional course picker, confirm.
 */
export function BulkImportPreview(): React.ReactNode {
  const {
    preview,
    previewSummary,
    courses,
    selectedCourseIds,
    toggleCourse,
    confirmImport,
    isBusy,
    actionError,
  } = useBulkImport();

  const validCount = previewSummary?.valid ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {validCount} to create · {previewSummary?.skipped ?? 0} to skip
      </p>

      <div className="grid gap-2">
        {preview.map((row, index) => (
          <div
            key={`${row.username}-${index}`}
            className="flex items-center justify-between rounded-md border p-2"
          >
            <div>
              <p className="text-sm font-medium">{row.name || "—"}</p>
              <p className="text-xs text-muted-foreground">@{row.username}</p>
            </div>
            <Badge variant="outline">{row.status}</Badge>
          </div>
        ))}
      </div>

      {courses.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Enroll into courses (optional)</p>
          {courses.map((course) => (
            <label
              key={course.id}
              htmlFor={`course-${course.id}`}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id={`course-${course.id}`}
                checked={selectedCourseIds.includes(course.id)}
                onCheckedChange={() => toggleCourse(course.id)}
              />
              {course.title}
            </label>
          ))}
        </div>
      )}

      {actionError && (
        <div
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={validCount === 0 || isBusy}
        onClick={() => confirmImport()}
      >
        {isBusy
          ? "Importing…"
          : `Import ${validCount} student${validCount === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}

/**
 * Report stage: per-student outcomes and a summary line.
 */
export function BulkImportReport(): React.ReactNode {
  const { report, reportSummary } = useBulkImport();
  const created = reportSummary?.created ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        Imported {created} student{created === 1 ? "" : "s"}
      </p>
      <div className="grid gap-2">
        {report.map((row, index) => (
          <div
            key={`${row.username}-${index}`}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <span>@{row.username}</span>
            <Badge variant="outline">
              {row.outcome}
              {row.reason ? `: ${row.reason}` : ""}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders the body for the current stage of the import flow.
 */
export function BulkImportBody(): React.ReactNode {
  const { stage } = useBulkImport();

  if (stage === ImportStage.Done) return <BulkImportReport />;
  if (stage === ImportStage.Previewed) return <BulkImportPreview />;
  return <BulkImportFilePicker />;
}
