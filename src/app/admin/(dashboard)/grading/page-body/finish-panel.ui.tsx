"use client";

import { useEffect, useRef } from "react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { Badge } from "src/components/ui/badge";

/** What a grading detail shows once grading is done. */
export interface FinishView {
  /** The finish panel, in place of the grade panel. */
  panel: React.ReactNode;
  /** Under the answer: the grade just saved; absent when the answer has none. */
  gradeLine?: string;
}

interface FinishPanelViewProps {
  testTitle: string;
  savedLine: string;
  gradedCount: number;
  /** The graded students named on the panel; the rest read "and n more". */
  gradedStudents: { name: string; username: string; released: boolean }[];
  moreGraded: number;
  releaseLine: string;
  /** Who is still writing or has not started; empty when everyone has handed in. */
  notInLine: string;
  backHref: string;
}

/** The finish panel's content. The heading takes focus so a keyboard user lands on the news. */
export function FinishPanelView({
  testTitle,
  savedLine,
  gradedCount,
  gradedStudents,
  moreGraded,
  releaseLine,
  notInLine,
  backHref,
}: FinishPanelViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section
      className="flex min-h-0 flex-col gap-3 rounded-lg border p-4"
      data-testid="finish-panel"
    >
      <header>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold wrap-anywhere outline-none"
        >
          Grading done · {testTitle}
        </h3>
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {savedLine}
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <p className="text-sm font-medium">
          All {gradedCount} submitted{" "}
          {gradedCount === 1 ? "student" : "students"} graded
        </p>
        <ul className="space-y-1 text-sm">
          {gradedStudents.map((s) => (
            <li key={s.username} className="flex items-center gap-2">
              <span className="min-w-0 wrap-anywhere">
                {s.name}{" "}
                <span className="text-xs text-muted-foreground">
                  @{s.username}
                </span>
              </span>
              <Badge variant={s.released ? "success" : "secondary"}>
                {s.released ? "Released" : "Graded"}
              </Badge>
            </li>
          ))}
          {moreGraded > 0 && (
            <li className="text-xs text-muted-foreground">
              and {moreGraded} more
            </li>
          )}
        </ul>
        <p className="text-sm">{releaseLine}</p>
        {notInLine && (
          <p className="text-sm text-muted-foreground">
            {notInLine} New submissions show up in To grade.
          </p>
        )}
        <GuardedLink
          href={backHref}
          className="inline-block text-sm underline underline-offset-2"
        >
          Back to test
        </GuardedLink>
      </div>
    </section>
  );
}
