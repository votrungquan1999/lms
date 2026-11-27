"use client";

import ReactDiffViewer from "react-diff-viewer-continued";
import { useTheme } from "src/components/theme-provider";
import { normalizeText } from "src/lib/text-normalization";

interface DiffViewerProps {
  studentAnswer: string;
  solution: string;
  /** Label for the left-hand column; defaults to the student's view of her own answer. */
  leftTitle?: string;
  /** Label for the right-hand column; defaults to the graded view's label. */
  rightTitle?: string;
  /** Two columns when true; one interleaved column when false. */
  splitView?: boolean;
}

const diffStyles = {
  diffContainer: {
    width: "100%",
    minWidth: "600px",
    tableLayout: "fixed" as const,
  },
};

/**
 * Diff view (two columns unless `splitView` is false) comparing a student's answer against a solution.
 * Uses react-diff-viewer-continued for GitHub-style highlighting.
 * Subscribes to the global ThemeProvider context for dark mode detection.
 */
export function DiffViewer({
  studentAnswer,
  solution,
  leftTitle = "Your Answer",
  rightTitle = "Correct Solution",
  splitView = true,
}: DiffViewerProps) {
  const { isDark } = useTheme();

  return (
    <div className="overflow-x-auto rounded-md border">
      <ReactDiffViewer
        oldValue={normalizeText(studentAnswer)}
        newValue={normalizeText(solution)}
        splitView={splitView}
        leftTitle={leftTitle}
        rightTitle={rightTitle}
        useDarkTheme={isDark}
        styles={diffStyles}
      />
    </div>
  );
}
