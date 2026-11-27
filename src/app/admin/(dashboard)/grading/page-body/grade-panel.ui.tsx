import type { ReactNode } from "react";

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

/** The grade panel's frame: which question and student the grade is for, then its content. */
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
  return (
    <section
      className="flex min-h-0 flex-col gap-3 rounded-lg border p-4"
      data-testid="grade-card"
    >
      <header className="flex shrink-0 items-start justify-between gap-2">
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
      {aiJobNotes}
      {answerChanged && (
        <p className="shrink-0 text-xs text-muted-foreground">
          Answer changed after your grade
        </p>
      )}
      {children}
    </section>
  );
}
