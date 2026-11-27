"use client";

import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
} from "react";
import { usePhotoMarks } from "src/app/admin/(dashboard)/grading/page-body/annotation-tool.state";
import type { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { useGradeLocked } from "src/app/admin/(dashboard)/grading/page-body/still-writing-confirm";
import {
  useHasUnsavedGrade,
  useReportUnsavedGrade,
} from "src/app/admin/(dashboard)/grading/page-body/unsaved-grade.state";
import { useLeaveGuard } from "src/app/admin/(dashboard)/leave-guard.state";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import type { GradingMode } from "src/lib/grading-mode";
import {
  type SaveAndNextState,
  saveAndNextAction,
  setTestFeedbackAction,
  type TestFeedbackState,
} from "./actions";

// ── Shared base props ─────────────────────────────────────────────────────────

/** What the pinned Save & next button posts and says. */
export interface SaveAndNextNavigation {
  /** The grading route the next link stays on. */
  routeKind: GradingRouteKind;
  mode: GradingMode;
  /** Keep "Needs grading only" on after the move. */
  needsOnly: boolean;
  /** The button's text: where it goes. */
  label: string;
  /** Shown above the button: how much is left. */
  leftLine?: string;
}

interface GradeFormProps {
  testId: string;
  courseId: string;
  questionId: string;
  studentId: string;
  /** When the answer on screen was saved; the grade records it, so a newer answer still needs grading. */
  gradedAnswerAt?: Date;
  existingScore: number | null;
  existingFeedback: string | null;
  existingSolution: string | null;
  saveAndNext: SaveAndNextNavigation;
  /** Offers 0 / 50 / 100 buttons that fill the score field. */
  showQuickScores?: boolean;
  /**
   * Changes whenever the saved grade changes. The fields remount on a new
   * value, so they show the saved grade instead of a stale draft.
   */
  formKey?: string;
  /** Scrolls with the fields, under them; the save buttons stay pinned below. */
  children?: React.ReactNode;
}

// ── Shared primitive: score / feedback / solution inputs ──────────────────────

const QUICK_SCORES = [0, 50, 100];

function GradeInputs({
  questionId,
  existingScore,
  existingFeedback,
  existingSolution,
  showQuickScores,
}: {
  questionId: string;
  existingScore: number | null;
  existingFeedback: string | null;
  existingSolution: string | null;
  showQuickScores: boolean;
}) {
  const [score, setScore] = useState(existingScore?.toString() ?? "");
  // The text fields stay uncontrolled; these hold what was typed, null until then.
  const [typedFeedback, setTypedFeedback] = useState<string | null>(null);
  const [typedSolution, setTypedSolution] = useState<string | null>(null);
  const hasDraft =
    score !== (existingScore?.toString() ?? "") ||
    (typedFeedback !== null && typedFeedback !== (existingFeedback ?? "")) ||
    (typedSolution !== null && typedSolution !== (existingSolution ?? ""));
  useReportUnsavedGrade("grade", hasDraft);
  const locked = useGradeLocked();

  return (
    // A disabled fieldset locks every field and quick-score button inside it.
    <fieldset
      disabled={locked}
      className="m-0 min-w-0 space-y-3 border-0 p-0 narrow:group-data-[collapsed]/panel:contents"
    >
      <div className="flex items-center gap-3 narrow:group-data-[collapsed]/panel:order-1">
        <label htmlFor={`score-${questionId}`} className="text-sm font-medium">
          Score (0–100):
        </label>
        <Input
          id={`score-${questionId}`}
          type="number"
          name="score"
          min={0}
          max={100}
          value={score}
          onChange={(event) => setScore(event.target.value)}
          className="w-24"
          required
        />
        {showQuickScores &&
          QUICK_SCORES.map((quick) => (
            <Button
              key={quick}
              type="button"
              size="sm"
              variant="outline"
              className="narrow:group-data-[collapsed]/panel:hidden"
              onClick={() => setScore(String(quick))}
            >
              {quick}
            </Button>
          ))}
      </div>

      <div className="narrow:group-data-[collapsed]/panel:hidden">
        <label
          htmlFor={`feedback-${questionId}`}
          className="text-sm font-medium"
        >
          Feedback:
        </label>
        <Textarea
          id={`feedback-${questionId}`}
          name="feedback"
          placeholder="Feedback for this question..."
          defaultValue={existingFeedback ?? ""}
          onChange={(event) => setTypedFeedback(event.target.value)}
          rows={2}
          className="mt-1 resize-y"
        />
      </div>

      <div className="narrow:group-data-[collapsed]/panel:hidden">
        <label
          htmlFor={`solution-${questionId}`}
          className="text-sm font-medium"
        >
          Correct Solution{" "}
          <span className="text-muted-foreground">(optional)</span>:
        </label>
        <Textarea
          id={`solution-${questionId}`}
          name="solution"
          placeholder="Enter the correct solution..."
          defaultValue={existingSolution ?? ""}
          onChange={(event) => setTypedSolution(event.target.value)}
          rows={3}
          className="mt-1 resize-y"
        />
      </div>
    </fieldset>
  );
}

// ── CompactGradeForm: grade inputs only (no outer card) ─────────────────────

/**
 * The grade inputs and the pinned Save & next button, with no card and no
 * question heading: those belong to the grade panel.
 */
export function CompactGradeForm({
  testId,
  courseId,
  questionId,
  studentId,
  gradedAnswerAt,
  existingScore,
  existingFeedback,
  existingSolution,
  saveAndNext,
  showQuickScores = false,
  formKey,
  children,
}: GradeFormProps) {
  // The Save & next button sits outside the form, so it targets the form by id.
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const locked = useGradeLocked();
  // Null when the answer has no photo to mark.
  const photoMarks = usePhotoMarks();
  useReportUnsavedGrade("photo-marks", photoMarks?.hasUnsavedMarks ?? false);
  // The overall-feedback form is outside this form, so Save & next would move on without it.
  const hasOverallDraft = useHasUnsavedGrade("overall-feedback");
  const { requestLeave } = useLeaveGuard();
  // The save and its redirect run as one pending action, so the button locks until the next answer opens.
  const [saveState, saveAction, isSaving] = useActionState<
    SaveAndNextState | null,
    FormData
  >((_previous, formData) => saveAndNextAction(formData), null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 narrow:group-data-[collapsed]/panel:contents">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto narrow:group-data-[collapsed]/panel:contents">
        <form
          key={formKey}
          id={formId}
          ref={formRef}
          // Submitting by hand, not through `action`, so a failed save does not reset what was typed.
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => saveAction(formData));
          }}
          className="space-y-3 narrow:group-data-[collapsed]/panel:contents"
        >
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="questionId" value={questionId} />
          <input type="hidden" name="studentId" value={studentId} />
          {gradedAnswerAt && (
            <input
              type="hidden"
              name="gradedAnswerAt"
              value={gradedAnswerAt.toISOString()}
            />
          )}
          <input type="hidden" name="routeKind" value={saveAndNext.routeKind} />
          <input type="hidden" name="mode" value={saveAndNext.mode} />
          {saveAndNext.needsOnly && (
            <input type="hidden" name="needsOnly" value="1" />
          )}
          {photoMarks && (
            <input
              type="hidden"
              name="annotations"
              value={photoMarks.marksJson}
            />
          )}

          <GradeInputs
            questionId={questionId}
            existingScore={existingScore}
            existingFeedback={existingFeedback}
            existingSolution={existingSolution}
            showQuickScores={showQuickScores}
          />
        </form>
        <div className="space-y-3 empty:hidden narrow:group-data-[collapsed]/panel:hidden">
          {children}
        </div>
      </div>

      {/* Outside the form's scroll area so the button stays in view; `form` ties it to it. */}
      <div className="shrink-0 space-y-2 narrow:group-data-[collapsed]/panel:order-3">
        {saveAndNext.leftLine && (
          <p className="text-xs text-muted-foreground narrow:group-data-[collapsed]/panel:hidden">
            {saveAndNext.leftLine}
          </p>
        )}
        {saveState?.message && (
          <p role="alert" className="text-sm text-destructive wrap-anywhere">
            {saveState.message}
          </p>
        )}
        <Button
          type="submit"
          form={formId}
          size="sm"
          className="w-full narrow:group-data-[collapsed]/panel:w-auto"
          disabled={isSaving || locked}
          onClick={(event) => {
            if (!hasOverallDraft) return;
            // Hold the submit until the teacher confirms losing the overall draft.
            event.preventDefault();
            requestLeave(() => formRef.current?.requestSubmit());
          }}
        >
          {saveAndNext.label}
        </Button>
      </div>
    </div>
  );
}

// ── OverallFeedbackForm ───────────────────────────────────────────────────────

interface OverallFeedbackFormProps {
  testId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  existingFeedback: string | null;
}

export function OverallFeedbackForm({
  testId,
  courseId,
  studentId,
  studentName,
  existingFeedback,
}: OverallFeedbackFormProps) {
  const [state, formAction, isPending] = useActionState<
    TestFeedbackState | null,
    FormData
  >(setTestFeedbackAction, null);
  // The field stays uncontrolled; this holds what was typed, null until then.
  // A save makes the saved feedback equal it, so it stops counting as a draft.
  const [typed, setTyped] = useState<string | null>(null);
  const hasDraft = typed !== null && typed !== (existingFeedback ?? "");
  useReportUnsavedGrade("overall-feedback", hasDraft);
  const locked = useGradeLocked();

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium wrap-anywhere">
        Overall feedback for {studentName}
      </summary>
      <form action={formAction} className="mt-3">
        <fieldset
          disabled={locked}
          className="m-0 min-w-0 space-y-3 border-0 p-0"
        >
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="studentId" value={studentId} />

          <label
            htmlFor={`overall-${studentId}`}
            className="text-sm font-medium"
          >
            Overall Test Feedback:
          </label>
          <Textarea
            id={`overall-${studentId}`}
            name="feedback"
            placeholder="Overall feedback for this student's test..."
            defaultValue={existingFeedback ?? ""}
            onChange={(event) => setTyped(event.target.value)}
            rows={3}
            className="resize-y"
          />

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending
                ? "Saving..."
                : existingFeedback
                  ? "Update Feedback"
                  : "Save Feedback"}
            </Button>
            {state?.message && (
              <p
                className={`text-sm ${state.success ? "text-green-600" : "text-destructive"}`}
              >
                {state.message}
              </p>
            )}
          </div>
        </fieldset>
      </form>
    </details>
  );
}
