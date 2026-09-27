"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import {
  ANSWER_REVEAL_MODE_HEADING,
  ANSWER_REVEAL_MODE_LABELS,
} from "src/lib/question-labels";
import { submitWithoutReset } from "src/lib/submit-without-reset";
import type { AnswerRevealMode } from "src/lib/test-service";
import { setTestSettingsAction } from "./settings-actions";

interface TestSettingsPanelProps {
  courseId: string;
  testId: string;
  showGradeAfterSubmit: boolean;
  showCorrectAnswerAfterSubmit: boolean;
  timeLimitMinutes: number | null;
  isPractice: boolean;
  answerRevealMode: AnswerRevealMode;
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
 * (`showGradeAfterSubmit`, `showCorrectAnswerAfterSubmit`, `isPractice`),
 * time limit, and answer reveal mode (side-by-side vs. plain). Practice and a
 * time limit are mutually exclusive (R10): checking Practice disables the
 * time-limit input so the forbidden combo can't be sent.
 */
export function TestSettingsPanel({
  courseId,
  testId,
  showGradeAfterSubmit,
  showCorrectAnswerAfterSubmit,
  timeLimitMinutes,
  isPractice,
  answerRevealMode,
  gradesReleasedAt,
  correctAnswersReleasedAt,
}: TestSettingsPanelProps) {
  // Tracks edits made after the last submit so the "Settings saved" message
  // never sits next to values it doesn't describe. Cleared at submit time,
  // not on success: clearing only on success would miss a control changed
  // while that save is still pending, since the resolve would clear it a
  // second time and hide the fact that the form moved on since the submit.
  // The message also hides while a save is pending: until it settles, the
  // previous save's message doesn't describe the values being saved.
  const [changedSinceSave, setChangedSinceSave] = useState(false);
  const [state, formAction, isPending] = useActionState<
    Awaited<ReturnType<typeof setTestSettingsAction>> | null,
    FormData
  >(setTestSettingsAction, null);
  const handleFormSubmit = submitWithoutReset(formAction);
  const [practice, setPractice] = useState(isPractice);

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Test Settings</h2>
      <form
        action={formAction}
        onSubmit={(event) => {
          setChangedSinceSave(false);
          handleFormSubmit(event);
        }}
        onChange={() => setChangedSinceSave(true)}
        className="mt-4 space-y-3"
      >
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

        <div className="flex items-center gap-2">
          <Checkbox
            id="is-practice"
            name="isPractice"
            value="true"
            checked={practice}
            onCheckedChange={(checked) => setPractice(checked === true)}
          />
          <Label htmlFor="is-practice">
            Practice test (no grades, reveal-on-answer)
          </Label>
        </div>

        <div className="space-y-1">
          <Label>{ANSWER_REVEAL_MODE_HEADING}</Label>
          <RadioGroup name="answerRevealMode" defaultValue={answerRevealMode}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="diff" id="answer-reveal-diff" />
              <Label htmlFor="answer-reveal-diff">
                {ANSWER_REVEAL_MODE_LABELS.diff}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="plain" id="answer-reveal-plain" />
              <Label htmlFor="answer-reveal-plain">
                {ANSWER_REVEAL_MODE_LABELS.plain}
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Turn on side-by-side comparison when you want the student to see
            exactly where their answer differs from yours — it appears when the
            score is not 100%.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="time-limit-minutes">Time limit (minutes)</Label>
          <Input
            // Remounts when the saved value actually changes, so a post-save
            // prop refresh replaces the stale uncontrolled DOM value instead
            // of leaving it behind (React only honors `defaultValue` at mount).
            key={timeLimitMinutes ?? "untimed"}
            id="time-limit-minutes"
            name="timeLimitMinutes"
            type="number"
            min={1}
            step={1}
            placeholder="Untimed"
            defaultValue={timeLimitMinutes ?? ""}
            disabled={practice}
          />
          <p className="text-xs text-muted-foreground">
            {practice
              ? "Practice tests can't be timed."
              : "Leave blank for an untimed test."}
          </p>
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

        {state?.success && !changedSinceSave && !isPending && (
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
