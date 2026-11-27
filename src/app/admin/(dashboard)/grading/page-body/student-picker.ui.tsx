"use client";

import { ChevronDown } from "lucide-react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import {
  STUDENT_PICKER_GROUPS,
  StudentPickerGroup,
  type StudentPickerRow,
} from "./student-picker-rows";

const GROUP_TITLES: Record<StudentPickerGroup, string> = {
  [StudentPickerGroup.NeedsGrading]: "Needs grading",
  [StudentPickerGroup.Graded]: "Graded",
  [StudentPickerGroup.StillWriting]: "Still writing",
  [StudentPickerGroup.RedoRequested]: "Redo requested",
  [StudentPickerGroup.NotStarted]: "Not started",
};

interface StudentPickerUiProps {
  /** The student on screen, or null when none is open. */
  currentName: string | null;
  rows: StudentPickerRow[];
  currentId: string | null;
  /** Where picking a student goes. */
  hrefFor: Record<string, string>;
}

/** The student picker: a dropdown naming the open student, listing every student under her status. */
export function StudentPickerUi({
  currentName,
  rows,
  currentId,
  hrefFor,
}: StudentPickerUiProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Student picker"
          className="min-w-0 max-w-64 gap-1"
        >
          <span className="truncate font-medium">
            {currentName ?? "Pick a student"}
          </span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 w-72 overflow-y-auto"
      >
        {STUDENT_PICKER_GROUPS.map((group) => {
          const members = rows.filter((row) => row.group === group);
          if (members.length === 0) return null;
          return (
            <DropdownMenuGroup key={group}>
              <DropdownMenuLabel>
                {GROUP_TITLES[group]} · {members.length}
              </DropdownMenuLabel>
              {group === StudentPickerGroup.NeedsGrading && (
                <p className="px-2 pb-1 text-xs text-muted-foreground">
                  oldest submission first
                </p>
              )}
              {members.map((row) => (
                <PickerItem
                  key={row.id}
                  row={row}
                  current={row.id === currentId}
                  href={hrefFor[row.id]}
                />
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PickerItem({
  row,
  current,
  href,
}: {
  row: StudentPickerRow;
  current: boolean;
  href: string | undefined;
}) {
  const label = (
    <span className="flex w-full min-w-0 items-baseline justify-between gap-2">
      <span className="truncate">{row.name}</span>
      {row.detail && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.detail}
        </span>
      )}
    </span>
  );
  if (!row.openable || href === undefined) {
    return <DropdownMenuItem disabled>{label}</DropdownMenuItem>;
  }
  return (
    <DropdownMenuItem asChild>
      <GuardedLink
        href={href}
        scroll={false}
        aria-current={current ? "true" : undefined}
      >
        {label}
      </GuardedLink>
    </DropdownMenuItem>
  );
}
