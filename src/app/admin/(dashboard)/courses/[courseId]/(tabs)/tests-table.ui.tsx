import Link from "next/link";
import type { ReactNode } from "react";
import { ReleaseFromList } from "src/app/admin/(dashboard)/grading/page-body/release-from-list";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
  PillTone,
  RowAction,
  type TestRowData,
  type TestRowPill,
} from "./test-rows";

/** Test | Submitted | Grading | Students see | action, with a stacked layout on a phone. */
export const TEST_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 px-4 md:grid-cols-[minmax(0,1fr)_112px_150px_160px_104px] md:items-center";

const PILL_VARIANT = {
  [PillTone.Amber]: "warning",
  [PillTone.Green]: "success",
  [PillTone.Grey]: "secondary",
  [PillTone.Blue]: "info",
  [PillTone.Plain]: null,
} as const;

/** The column titles above the rows; the rows say the same in words, so screen readers skip it. */
export function TestsColumnHeader() {
  return (
    <div
      aria-hidden="true"
      className={`${TEST_GRID} hidden h-10 rounded-t-xl border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid`}
    >
      <span>Test</span>
      <span>Submitted</span>
      <span>Grading</span>
      <span>Students see</span>
      <span />
    </div>
  );
}

/** A coloured pill, or plain quiet text for the states that carry no colour. */
function Pill({ pill }: { pill: TestRowPill }) {
  const variant = PILL_VARIANT[pill.tone];
  if (!variant) {
    return (
      <span className="text-[13px] text-muted-foreground">{pill.text}</span>
    );
  }
  return <Badge variant={variant}>{pill.text}</Badge>;
}

/** Grade and Open are links; Release is the button that releases the grades. */
function RowActionControl({ row }: { row: TestRowData }) {
  const testHref = `/admin/courses/${row.courseId}/tests/${row.testId}`;
  if (row.action === RowAction.Release) {
    return (
      <ReleaseFromList
        testId={row.testId}
        courseId={row.courseId}
        testTitle={row.title}
      />
    );
  }
  return (
    <Button
      asChild
      size="sm"
      variant={row.action === RowAction.Grade ? "default" : "outline"}
      className="min-w-[104px]"
    >
      <Link
        href={row.action === RowAction.Grade ? `${testHref}/grading` : testHref}
      >
        {row.action === RowAction.Grade ? "Grade" : "Open"}
      </Link>
    </Button>
  );
}

/**
 * One test row. The line under the title is the row's own detail: tags and
 * question counts in the full list, who is waiting in "Needs your action".
 * @param row - The test's display data.
 * @param line - The line under the title.
 * @param showTags - Whether the Practice / Timed / No questions tags show beside the title.
 */
export function TestRowView({
  row,
  line,
  showTags,
  children,
}: {
  row: TestRowData;
  line: string;
  showTags: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid={`test-row-${row.testId}`}
      className={`${TEST_GRID} min-h-[72px] border-b py-3 last:border-b-0 hover:bg-muted/30`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/admin/courses/${row.courseId}/tests/${row.testId}`}
            className="font-semibold [overflow-wrap:anywhere] hover:underline"
          >
            {row.title}
          </Link>
          {showTags &&
            row.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="rounded-md">
                {tag}
              </Badge>
            ))}
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{line}</p>
        {children}
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
        <span className="text-sm">{row.submitted}</span>
        <span>
          <Pill pill={row.grading} />
        </span>
        <span>
          <Pill pill={row.see} />
        </span>
      </div>
      <div className="col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto">
        <RowActionControl row={row} />
      </div>
    </div>
  );
}
