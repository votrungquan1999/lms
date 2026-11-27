"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "src/components/ui/button";

interface GradePanelShellProps {
  questionOrder: number;
  questionTitle: string;
  studentName: string;
  studentUsername: string;
  aiJobNotes?: ReactNode;
  /** The answer was saved after its grade, so the grade is out of date. */
  answerChanged?: boolean;
  /** Student-level actions shown beside the title (the More menu). */
  headerAction?: ReactNode;
  children: ReactNode;
}

/**
 * The grade panel's frame: which question and student the grade is for, then its content.
 * Below 900px it folds into one bar (score, Feedback, Save & next) that expands on tap; folding only hides the fields, so a typed draft stays.
 * The AI job notes and the changed-answer note stay in the folded bar, on a row above its controls.
 */
export function GradePanelShell({
  questionOrder,
  questionTitle,
  studentName,
  studentUsername,
  aiJobNotes,
  answerChanged = false,
  headerAction,
  children,
}: GradePanelShellProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="group/panel flex min-h-0 flex-col gap-3 rounded-lg border p-4 narrow:max-h-[70vh] narrow:data-[collapsed]:max-h-none narrow:data-[collapsed]:flex-row narrow:data-[collapsed]:flex-wrap narrow:data-[collapsed]:items-center narrow:data-[collapsed]:p-2"
      data-testid="grade-card"
      data-collapsed={expanded ? undefined : ""}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 narrow:group-data-[collapsed]/panel:hidden">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold wrap-anywhere">
            Grade · Q{questionOrder} · {studentName}
          </h3>
          <p className="text-xs text-muted-foreground wrap-anywhere">
            {questionTitle} · @{studentUsername}
          </p>
        </div>
        {headerAction}
      </header>
      <div className="space-y-3 empty:hidden narrow:group-data-[collapsed]/panel:order-first narrow:group-data-[collapsed]/panel:w-full narrow:group-data-[collapsed]/panel:space-y-1">
        {aiJobNotes}
        {answerChanged && (
          <p className="shrink-0 text-xs text-muted-foreground">
            Answer changed after your grade
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden shrink-0 narrow:inline-flex narrow:group-data-[collapsed]/panel:order-2"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Collapse" : "Feedback"}
      </Button>
      {children}
    </section>
  );
}
