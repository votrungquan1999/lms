"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "src/components/ui/card";
import { useGradedGroup } from "./graded-group.state";

/** The page column: a short queue reads better in a calm column than stretched wide. */
export function ToGradeColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="grid max-w-4xl gap-8">{children}</div>
    </div>
  );
}

/** Page title block: the heading and the summary line under it. */
export function ToGradeHeader({ children }: { children: ReactNode }) {
  return <header className="grid gap-1">{children}</header>;
}

/** The summary line under the page title. */
export function ToGradeSummary({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** A titled section of the page. */
export function ToGradeSection({ children }: { children: ReactNode }) {
  return <section className="grid gap-3">{children}</section>;
}

/** A section's heading line. */
export function ToGradeSectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}

/** One course's card: its header row, then the test rows. */
export function ToGradeGroup({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 py-0" data-testid="to-grade-group">
      {children}
    </Card>
  );
}

/** The course line at the top of a group. */
export function ToGradeGroupHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** One test row: details on the left, actions on the right. */
export function ToGradeRow({
  testId,
  children,
}: {
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-4 border-b px-5 py-4 last:border-b-0"
      data-testid={`hub-test-card-${testId}`}
      data-test-id={testId}
    >
      {children}
    </div>
  );
}

/** The left side of a row: title line, then the detail lines. */
export function ToGradeRowDetails({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 flex-1 gap-1">{children}</div>;
}

/** The row's title with its badge. */
export function ToGradeRowTitle({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5">{children}</div>;
}

/** The test's title, which wraps instead of widening the row when it has no break points. */
export function ToGradeRowTitleLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="min-w-0 text-[17px] font-semibold [overflow-wrap:anywhere]"
    >
      {children}
    </Link>
  );
}

/** A row's main detail line. */
export function ToGradeRowLine({ children }: { children: ReactNode }) {
  return <p className="text-sm">{children}</p>;
}

/** A row's quieter second detail line. */
export function ToGradeRowMeta({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}

/** The right side of a row: its action buttons. */
export function ToGradeRowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-none gap-2">{children}</div>;
}

/** The heading of a section whose rows fold away; its button opens and closes them. */
export function GradedGroupToggle({ children }: { children: ReactNode }) {
  const { isOpen, panelId, toggle } = useGradedGroup();
  return (
    <h2 className="text-[15px] font-semibold text-foreground/80">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex items-center gap-1.5"
      >
        <ChevronRight
          className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        {children}
      </button>
    </h2>
  );
}

/** The folded rows; nothing is rendered until the group is open. */
export function GradedGroupPanel({ children }: { children: ReactNode }) {
  const { isOpen, panelId } = useGradedGroup();
  return (
    <div id={panelId} className="grid gap-3">
      {isOpen && children}
    </div>
  );
}

/** A section heading with a quiet note beside it. */
export function ToGradeSectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5">{children}</div>
  );
}

/** A quiet note under or beside a heading. */
export function ToGradeNote({ children }: { children: ReactNode }) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>;
}
