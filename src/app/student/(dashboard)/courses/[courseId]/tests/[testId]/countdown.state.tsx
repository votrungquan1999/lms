"use client";

import { useEffect } from "react";
import { useNow } from "src/hooks/use-now";
import { submitTestAction } from "./actions";

interface TestCountdownProps {
  deadlineMs: number;
  testId: string;
  courseId: string;
}

/**
 * Formats a non-negative whole-second duration as zero-padded `mm:ss`.
 * @param totalSeconds - Remaining seconds (already floored at >= 0).
 * @returns The duration string, e.g. 600 -> "10:00".
 */
function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Live countdown to a server-computed true deadline (epoch ms). The visible
 * `mm:ss` re-renders each animation frame via `useNow()` (floored at 00:00).
 *
 * Auto-submit is driven by a single one-shot `setTimeout` scheduled to the true
 * deadline — an external-resource subscription (NOT a per-frame render-time
 * check), so it fires `submitTestAction` exactly once. The manual-vs-auto race
 * is de-duped server-side ("already submitted").
 * @param deadlineMs - The true deadline as epoch milliseconds.
 * @param testId - The test to auto-submit.
 * @param courseId - The course the test belongs to.
 */
export function TestCountdown({
  deadlineMs,
  testId,
  courseId,
}: TestCountdownProps) {
  const now = useNow();
  const remainingSeconds = Math.max(0, Math.ceil((deadlineMs - now) / 1000));

  useEffect(() => {
    const fire = () => {
      const formData = new FormData();
      formData.set("testId", testId);
      formData.set("courseId", courseId);
      submitTestAction(null, formData);
    };
    const timer = setTimeout(fire, Math.max(0, deadlineMs - Date.now()));
    return () => clearTimeout(timer);
  }, [deadlineMs, testId, courseId]);

  return (
    <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">
      Time remaining:{" "}
      <span className="font-mono tabular-nums">
        {formatMmSs(remainingSeconds)}
      </span>
    </div>
  );
}
