"use client";

import { useEffect } from "react";
import { useNow } from "src/hooks/use-now";
import { EXPECTED_SCHOOL_FIELD } from "src/lib/expected-school";
import { submitTestAction } from "./actions";

interface TestCountdownProps {
  deadlineMs: number;
  testId: string;
  courseId: string;
  schoolId: string;
}

/**
 * Formats a non-negative whole-second duration as `mm:ss`, rolling over to
 * `h:mm:ss` once the duration reaches an hour (a 90-minute test would
 * otherwise start at the unreadable "90:00").
 * @param totalSeconds - Remaining seconds (already floored at >= 0).
 * @returns The duration string, e.g. 600 -> "10:00", 5400 -> "1:30:00".
 */
function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmSs = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmSs}` : mmSs;
}

/**
 * Live countdown to a server-computed true deadline (epoch ms). The visible
 * time re-renders each animation frame via `useNow()` (floored at 00:00).
 *
 * Auto-submit is driven by a single one-shot `setTimeout` scheduled to the true
 * deadline — an external-resource subscription (NOT a per-frame render-time
 * check), so it fires `submitTestAction` exactly once. The manual-vs-auto race
 * is de-duped server-side ("already submitted").
 * @param deadlineMs - The true deadline as epoch milliseconds.
 * @param testId - The test to auto-submit.
 * @param courseId - The course the test belongs to.
 * @param schoolId - The active school when the test page rendered.
 */
export function TestCountdown({
  deadlineMs,
  testId,
  courseId,
  schoolId,
}: TestCountdownProps) {
  const now = useNow();
  const remainingSeconds = Math.max(0, Math.ceil((deadlineMs - now) / 1000));

  useEffect(() => {
    const fire = () => {
      const formData = new FormData();
      formData.set("testId", testId);
      formData.set("courseId", courseId);
      formData.set(EXPECTED_SCHOOL_FIELD, schoolId);
      submitTestAction(null, formData);
    };
    const timer = setTimeout(fire, Math.max(0, deadlineMs - Date.now()));
    return () => clearTimeout(timer);
  }, [deadlineMs, testId, courseId, schoolId]);

  return (
    <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">
      Time remaining:{" "}
      <span className="font-mono tabular-nums">
        {formatRemaining(remainingSeconds)}
      </span>
    </div>
  );
}
