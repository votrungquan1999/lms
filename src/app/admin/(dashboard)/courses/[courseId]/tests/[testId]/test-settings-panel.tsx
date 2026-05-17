"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Label } from "src/components/ui/label";
import { setTestSettingsAction } from "./settings-actions";

interface TestSettingsPanelProps {
  courseId: string;
  testId: string;
  showGradeAfterSubmit: boolean;
  showCorrectAnswerAfterSubmit: boolean;
  gradesReleasedAt: Date | null;
  correctAnswersReleasedAt: Date | null;
}

function formatReleaseLine(label: string, date: Date | null): string {
  return date
    ? `${label} released at ${date.toLocaleDateString("en-US")}`
    : `${label}: Not released`;
}

/**
 * Inline admin panel that lets an admin edit a test's visibility flags
 * (`showGradeAfterSubmit`, `showCorrectAnswerAfterSubmit`).
 */
export function TestSettingsPanel({
  courseId,
  testId,
  showGradeAfterSubmit,
  showCorrectAnswerAfterSubmit,
  gradesReleasedAt,
  correctAnswersReleasedAt,
}: TestSettingsPanelProps) {
  const [state, formAction, isPending] = useActionState(
    setTestSettingsAction,
    null,
  );

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Test Settings</h2>
      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="testId" value={testId} />
        <input type="hidden" name="courseId" value={courseId} />

        <div className="flex items-center gap-2">
          <Checkbox
            id="show-grade-after-submit"
            name="showGradeAfterSubmit"
            value="true"
            defaultChecked={showGradeAfterSubmit}
          />
          <Label htmlFor="show-grade-after-submit">
            Show grade after submit
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="show-correct-answer-after-submit"
            name="showCorrectAnswerAfterSubmit"
            value="true"
            defaultChecked={showCorrectAnswerAfterSubmit}
          />
          <Label htmlFor="show-correct-answer-after-submit">
            Show correct answer after submit
          </Label>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>{formatReleaseLine("Grades", gradesReleasedAt)}</p>
          <p>
            {formatReleaseLine("Correct answers", correctAnswersReleasedAt)}
          </p>
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Settings"}
        </Button>

        {state?.success && (
          <output className="block text-sm text-emerald-600">
            {state.message}
          </output>
        )}
        {state && !state.success && (
          <div className="text-sm text-destructive" role="alert">
            {state.message}
          </div>
        )}
      </form>
    </div>
  );
}
