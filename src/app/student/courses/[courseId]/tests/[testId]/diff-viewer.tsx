"use client";

import ReactDiffViewer from "react-diff-viewer-continued";

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
 */
export function DiffViewer({ studentAnswer, solution }: DiffViewerProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <ReactDiffViewer
        oldValue={studentAnswer}
        newValue={solution}
        splitView={true}
        leftTitle="Your Answer"
        rightTitle="Correct Solution"
        useDarkTheme={false}
        styles={diffStyles}
      />
    </div>
  );
}
