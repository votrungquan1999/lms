"use client";

import ReactDiffViewer from "react-diff-viewer-continued";
import { useTheme } from "src/components/theme-provider";

interface DiffViewerProps {
  studentAnswer: string;
  solution: string;
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
export function DiffViewer({ studentAnswer, solution }: DiffViewerProps) {
  const { isDark } = useTheme();

  return (
    <div className="overflow-x-auto rounded-md border">
      <ReactDiffViewer
        oldValue={studentAnswer}
        newValue={solution}
        splitView={true}
        leftTitle="Your Answer"
        rightTitle="Correct Solution"
        useDarkTheme={isDark}
        styles={diffStyles}
      />
    </div>
  );
}
