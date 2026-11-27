"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { useLeaveGuard } from "src/app/admin/(dashboard)/leave-guard.state";
import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { Input } from "src/components/ui/input";
import { StillWritingConfirm } from "./still-writing-confirm";
import {
  matchesPickerSearch,
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
  testTitle: string;
  rows: StudentPickerRow[];
  currentId: string | null;
  /** Where picking a student goes. */
  hrefFor: Record<string, string>;
  /** Where "Next waiting student" goes, or null when no other student waits. */
  nextWaitingHref: string | null;
}

/** The student picker: a dropdown naming the open student, listing every student under her status. */
export function StudentPickerUi({
  currentName,
  testTitle,
  rows,
  currentId,
  hrefFor,
  nextWaitingHref,
}: StudentPickerUiProps) {
  const router = useRouter();
  const { requestLeave } = useLeaveGuard();
  const [query, setQuery] = useState("");
  // The still-writing student the teacher picked and has not yet confirmed.
  const [asking, setAsking] = useState<StudentPickerRow | null>(null);
  const matching = rows.filter((row) => matchesPickerSearch(row, query));

  return (
    <>
      <DropdownMenu onOpenChange={() => setQuery("")}>
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
          <div className="p-1">
            <Input
              type="search"
              aria-label="Search students"
              placeholder="Search name or @username"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // Keys typed here must not drive the menu's own type-ahead and arrow keys.
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
          {query.trim() !== "" ? null : nextWaitingHref === null ? (
            <DropdownMenuItem disabled>
              <NextWaitingLabel />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <GuardedLink href={nextWaitingHref} scroll={false}>
                <NextWaitingLabel />
              </GuardedLink>
            </DropdownMenuItem>
          )}
          {matching.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No student matches
            </p>
          )}
          {STUDENT_PICKER_GROUPS.map((group) => {
            const members = matching.filter((row) => row.group === group);
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
                {group === StudentPickerGroup.StillWriting && (
                  <p className="px-2 pb-1 text-xs text-muted-foreground">
                    asks first
                  </p>
                )}
                {members.map((row) => (
                  <PickerItem
                    key={row.id}
                    row={row}
                    current={row.id === currentId}
                    href={hrefFor[row.id]}
                    onAsk={() => setAsking(row)}
                  />
                ))}
              </DropdownMenuGroup>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <StillWritingConfirm
        student={asking}
        testTitle={testTitle}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const href = asking ? hrefFor[asking.id] : undefined;
          setAsking(null);
          if (href) requestLeave(() => router.push(href));
        }}
      />
    </>
  );
}

function NextWaitingLabel() {
  return (
    <span className="flex w-full min-w-0 items-baseline justify-between gap-2">
      <span className="truncate">Next waiting student</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        skips graded
      </span>
    </span>
  );
}

function PickerItem({
  row,
  current,
  href,
  onAsk,
}: {
  row: StudentPickerRow;
  current: boolean;
  href: string | undefined;
  onAsk: () => void;
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
  if (row.group === StudentPickerGroup.StillWriting) {
    return (
      <DropdownMenuItem
        aria-current={current ? "true" : undefined}
        onSelect={onAsk}
      >
        {label}
      </DropdownMenuItem>
    );
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
