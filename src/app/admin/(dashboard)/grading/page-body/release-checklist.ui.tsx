"use client";

import { useState } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { type ReleaseStudent, ReleaseStudentStatus } from "./release-students";
import { matchesPickerSearch } from "./student-picker-rows";

interface ReleaseChecklistProps {
  students: ReleaseStudent[];
  /** Ids of the ticked students who are not released yet. */
  chosenIds: ReadonlySet<string>;
  onToggle: (studentId: string, checked: boolean) => void;
  /** Ticks every graded student who is not released yet. */
  onSelectAllGraded: (studentIds: string[]) => void;
}

/** The words beside a student who cannot be ticked. */
const FIXED_STATUS_TEXT: Partial<Record<ReleaseStudentStatus, string>> = {
  [ReleaseStudentStatus.Released]: "Released",
  [ReleaseStudentStatus.Waiting]: "Waiting for grading",
  [ReleaseStudentStatus.StillWriting]: "Still writing",
  [ReleaseStudentStatus.RedoRequested]: "Redo requested",
  [ReleaseStudentStatus.NotStarted]: "Not started",
};

/** The students of a test with a box each: graded ones can be ticked, the rest show why not. */
export function ReleaseChecklist({
  students,
  chosenIds,
  onToggle,
  onSelectAllGraded,
}: ReleaseChecklistProps) {
  const [query, setQuery] = useState("");
  const graded = students.filter(
    (s) =>
      s.status === ReleaseStudentStatus.Graded ||
      s.status === ReleaseStudentStatus.Released,
  );
  const others = students.filter((s) => !graded.includes(s));
  const tickable = graded
    .filter((s) => s.status === ReleaseStudentStatus.Graded)
    .map((s) => s.id);
  const shown = (list: ReleaseStudent[]) =>
    list.filter((s) => matchesPickerSearch(s, query));

  return (
    <div className="space-y-3" data-testid="release-checklist">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search students"
          aria-label="Search students"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={tickable.length === 0}
          onClick={() => onSelectAllGraded(tickable)}
        >
          Select all graded ({tickable.length})
        </Button>
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto">
        <ChecklistGroup title={`Graded · ${graded.length}`}>
          {shown(graded).map((student) => {
            const released = student.status === ReleaseStudentStatus.Released;
            return (
              <ChecklistRow
                key={student.id}
                student={student}
                checked={released || chosenIds.has(student.id)}
                disabled={released}
                note={released ? FIXED_STATUS_TEXT[student.status] : undefined}
                onToggle={onToggle}
              />
            );
          })}
        </ChecklistGroup>
        {others.length > 0 && (
          <ChecklistGroup title="Not graded yet">
            {shown(others).map((student) => (
              <ChecklistRow
                key={student.id}
                student={student}
                checked={false}
                disabled
                note={FIXED_STATUS_TEXT[student.status]}
                onToggle={onToggle}
              />
            ))}
          </ChecklistGroup>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{chosenIds.size} selected</p>
    </div>
  );
}

/** A titled group of students in the release checklist. */
function ChecklistGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

/** One student's tick box in the release checklist, with a note on why it may be disabled. */
function ChecklistRow({
  student,
  checked,
  disabled,
  note,
  onToggle,
}: {
  student: ReleaseStudent;
  checked: boolean;
  disabled: boolean;
  note: string | undefined;
  onToggle: (studentId: string, checked: boolean) => void;
}) {
  const id = `release-student-${student.id}`;
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onToggle(student.id, next === true)}
      />
      <Label htmlFor={id} className="flex flex-1 items-baseline gap-2">
        <span>{student.name}</span>
        <span className="text-xs font-normal text-muted-foreground">
          @{student.username}
        </span>
        {note && (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {note}
          </span>
        )}
      </Label>
    </div>
  );
}
