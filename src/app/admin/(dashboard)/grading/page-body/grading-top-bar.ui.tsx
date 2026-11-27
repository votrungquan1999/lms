"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";

interface GradingTopBarProps {
  /** The test page the back link returns to. */
  backHref: string;
  testTitle: string;
  pivot: ReactNode;
  /** The current student and ‹ ›; null in By question mode. */
  position: ReactNode;
  progress: ReactNode;
  /** Controls kept at the bar's right end. */
  actions: ReactNode;
}

/**
 * The grading screen's slim top bar: the way back to the test, the mode
 * switch, the current student, progress and the release controls.
 */
export function GradingTopBar({
  backHref,
  testTitle,
  pivot,
  position,
  progress,
  actions,
}: GradingTopBarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-card px-3 py-2"
      data-testid="grading-top-bar"
    >
      <GuardedLink
        href={backHref}
        title={testTitle}
        className="flex min-w-0 max-w-64 items-center gap-1 text-sm font-medium hover:underline"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{testTitle}</span>
      </GuardedLink>
      {pivot}
      {position}
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {progress}
        {actions}
      </div>
    </div>
  );
}

interface StudentPositionProps {
  /** The student picker, naming the student on screen. */
  picker: ReactNode;
  /** 1-based place among the submitted students; null when the student is not one of them. */
  index: number | null;
  submittedCount: number;
  /** Null at the first / last submitted student. */
  previousHref: string | null;
  nextHref: string | null;
}

/** The student picker with ‹ k of N submitted › to step through the students who handed in. */
export function StudentPosition({
  picker,
  index,
  submittedCount,
  previousHref,
  nextHref,
}: StudentPositionProps) {
  return (
    <span
      className="flex min-w-0 items-center gap-2 text-sm"
      data-testid="grading-student-position"
    >
      {picker}
      <StepControl href={previousHref} label="Previous submitted student">
        ‹
      </StepControl>
      <span className="whitespace-nowrap text-muted-foreground">
        {index ?? "–"} of {submittedCount} submitted
      </span>
      <StepControl href={nextHref} label="Next submitted student">
        ›
      </StepControl>
    </span>
  );
}

/** One ‹ or › step: a link to that student, or a dimmed mark when there is none. */
function StepControl({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  if (href === null) {
    return (
      <span aria-disabled="true" className="px-1 text-muted-foreground/40">
        {children}
      </span>
    );
  }
  return (
    <GuardedLink
      href={href}
      aria-label={label}
      className="px-1 hover:underline"
    >
      {children}
    </GuardedLink>
  );
}
