import type { ReactNode } from "react";

interface GradePanelShellProps {
  questionOrder: number;
  questionTitle: string;
  studentName: string;
  studentUsername: string;
  children: ReactNode;
}

/** The grade panel's frame: which question and student the grade is for, then its content. */
export function GradePanelShell({
  questionOrder,
  questionTitle,
  studentName,
  studentUsername,
  children,
}: GradePanelShellProps) {
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      data-testid="grade-card"
    >
      <header>
        <h3 className="text-sm font-semibold wrap-anywhere">
          Grade · Q{questionOrder} · {studentName}
        </h3>
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {questionTitle} · @{studentUsername}
        </p>
      </header>
      {children}
    </section>
  );
}
