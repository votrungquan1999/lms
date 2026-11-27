"use client";

import { useState } from "react";
import { DiffViewer } from "src/components/diff-viewer";
import { Button } from "src/components/ui/button";
import { lineDiffCount } from "src/lib/line-diff-count";
import { pluralize } from "src/lib/pluralize";

interface CompareWithAiFixProps {
  studentName: string;
  studentAnswer: string;
  /** The AI's corrected version of the answer. */
  aiFix: string;
}

/** A fold that puts the student's answer next to the AI's fixed answer. */
export function CompareWithAiFix({
  studentName,
  studentAnswer,
  aiFix,
}: CompareWithAiFixProps) {
  const [open, setOpen] = useState(false);
  const differing = lineDiffCount(studentAnswer, aiFix);

  return (
    <div className="space-y-2" data-testid="compare-with-ai-fix">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Compare with AI fix
      </Button>
      {open && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {differing} {pluralize(differing, "line")} differs
          </p>
          <DiffViewer
            studentAnswer={studentAnswer}
            solution={aiFix}
            leftTitle={`${studentName}'s answer`}
            rightTitle={`AI suggested fix · not shown to ${studentName} until you use it`}
          />
        </div>
      )}
    </div>
  );
}
