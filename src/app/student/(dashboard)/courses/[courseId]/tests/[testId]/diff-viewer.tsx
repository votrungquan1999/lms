"use client";

import ReactDiffViewer from "react-diff-viewer-continued";
import { useTheme } from "src/components/theme-provider";
import { normalizeText } from "src/lib/text-normalization";

interface DiffViewerProps {
  studentAnswer: string;
  solution: string;
  /** Label for the right-hand column; defaults to the graded view's label. */
  rightTitle?: string;
}

const diffStyles = {
  diffContainer: {
    width: "100%",
    minWidth: "600px",
    tableLayout: "fixed" as const,
  },
};

/**
 * Side-by-side diff view comparing a student's answer against the correct solution.
 * Uses react-diff-viewer-continued for GitHub-style highlighting.
 * Subscribes to the global ThemeProvider context for dark mode detection.
 */
export function DiffViewer({
  studentAnswer,
  solution,
  rightTitle = "Correct Solution",
}: DiffViewerProps) {
  const { isDark } = useTheme();

  return (
    <div className="overflow-x-auto rounded-md border">
      <ReactDiffViewer
        oldValue={normalizeText(studentAnswer)}
        newValue={normalizeText(solution)}
        splitView={true}
        leftTitle="Your Answer"
        rightTitle={rightTitle}
        useDarkTheme={isDark}
        styles={diffStyles}
      />
    </div>
  );
}
