import type { ReactNode } from "react";

interface GradePanelShellProps {
  questionOrder: number;
  questionTitle: string;
  studentName: string;
  studentUsername: string;
  aiJobNotes?: ReactNode;
  children: ReactNode;
}

/** The grade panel's frame: which question and student the grade is for, then its content. */
export function GradePanelShell({
  questionOrder,
  questionTitle,
  studentName,
  studentUsername,
  aiJobNotes,
  children,
}: GradePanelShellProps) {
  return (
    <section
      className="flex min-h-0 flex-col gap-3 rounded-lg border p-4"
      data-testid="grade-card"
    >
      <header className="shrink-0">
        <h3 className="text-sm font-semibold wrap-anywhere">
          Grade · Q{questionOrder} · {studentName}
        </h3>
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {questionTitle} · @{studentUsername}
        </p>
      </header>
      {aiJobNotes}
      {children}
    </section>
  );
}
