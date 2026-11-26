import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "src/components/ui/card";

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
