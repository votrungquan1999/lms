"use client";

interface AiGradingInProgressNoteProps {
  /** When the pending job was started. */
  startedAt: Date;
}

/**
 * Tells the teacher a grading job is still running and since when, so a short
 * wait reads differently from a stall.
 * @param props - The pending job's start time.
 */
export function AiGradingInProgressNote({
  startedAt,
}: AiGradingInProgressNoteProps) {
  return (
    <p
      className="text-sm text-muted-foreground"
      data-testid="ai-grading-in-progress"
    >
      AI grading in progress since {startedAt.toLocaleString()}
    </p>
  );
}
