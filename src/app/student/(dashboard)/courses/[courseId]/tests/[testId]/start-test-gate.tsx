"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { type StartTestState, startTest } from "./actions";

interface StartTestGateProps {
  testId: string;
  courseId: string;
  timeLimitMinutes: number;
}

/**
 * Start gate for a timed test. Shown before the student begins; clicking Start
 * fires the `startTest` action, which records the server-side start time and
 * reveals the questions on the next render.
 */
export function StartTestGate({
  testId,
  courseId,
  timeLimitMinutes,
}: StartTestGateProps) {
  const [state, formAction, isPending] = useActionState<
    StartTestState | null,
    FormData
  >(startTest, null);

  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground">
      <h2 className="text-xl font-semibold">Timed test</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This test has a {timeLimitMinutes}-minute time limit. The countdown
        starts as soon as you click Start, and the test submits automatically
        when time runs out.
      </p>
      <form action={formAction} className="mt-4">
        <input type="hidden" name="testId" value={testId} />
        <input type="hidden" name="courseId" value={courseId} />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Starting..." : "Start Test"}
        </Button>
      </form>
      {state && !state.success && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
