"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { StudentStatusBadge } from "../student-status-badge";
import {
  GradingSort,
  type RosterStudentCellModel,
} from "./grading-page-body.type";
import { gradingHref } from "./href";

interface RosterCellProps {
  cell: RosterStudentCellModel;
}

/**
 * Single roster cell — student name, status badge, and graded count.
 * Display-only; the parent owns container layout and ordering.
 */
export function RosterCell({ cell }: RosterCellProps) {
  return (
    <div
      className="space-y-1 rounded-sm px-2 py-1.5"
      data-testid={`roster-cell-${cell.id}`}
    >
      <p className="text-sm font-medium">{cell.name}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <StudentStatusBadge status={cell.status} />
        <span>
          {cell.gradedCount}/{cell.answeredCount} graded
        </span>
      </div>
    </div>
  );
}

interface SortDropdownProps {
  basePath: string;
  sort: GradingSort;
}

const SORT_LABELS: Record<GradingSort, string> = {
  [GradingSort.Enrollment]: "Enrollment",
  [GradingSort.Status]: "Status",
  [GradingSort.Name]: "Name",
};

/**
 * Roster sort dropdown. Each item is a `<Link>` to the same page with
 * `?sort=` updated; selection persists in the URL and survives grade
 * submissions (the comparator runs at render time).
 */
export function SortDropdown({ basePath, sort }: SortDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          data-testid="roster-sort-dropdown"
        >
          <span>Sort: {SORT_LABELS[sort]}</span>
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.values(GradingSort).map((value) => (
          <DropdownMenuItem key={value} asChild>
            <Link
              href={gradingHref({ basePath, sort: value })}
              scroll={false}
              aria-current={value === sort ? "true" : undefined}
            >
              {SORT_LABELS[value]}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
