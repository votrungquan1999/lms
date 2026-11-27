"use client";

import { useState, useSyncExternalStore } from "react";
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

const NARROW_QUERY = "(max-width: 899.98px)";

/** Tells React when the screen crosses the narrow breakpoint. */
function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the screen is below 900px, where the grading screen folds its panels.
 * @returns True on a tablet or phone; false on the server, so the first paint matches the wide layout.
 */
function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

/** A fold that puts the student's answer next to the AI's fixed answer. */
export function CompareWithAiFix({
  studentName,
  studentAnswer,
  aiFix,
}: CompareWithAiFixProps) {
  const [open, setOpen] = useState(false);
  const differing = lineDiffCount(studentAnswer, aiFix);
  const narrow = useNarrowScreen();

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
            {/* One column has one title, so the privacy note moves here. */}
            {narrow && ` · not shown to ${studentName} until you use it`}
          </p>
          <DiffViewer
            studentAnswer={studentAnswer}
            solution={aiFix}
            leftTitle={
              narrow
                ? `− ${studentName}'s answer · + AI suggested fix`
                : `${studentName}'s answer`
            }
            splitView={!narrow}
            rightTitle={`AI suggested fix · not shown to ${studentName} until you use it`}
          />
        </div>
      )}
    </div>
  );
}
