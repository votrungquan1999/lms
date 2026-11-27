"use client";

import { useActionState, useId, useState } from "react";
import { formatReleaseLine } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/test-settings-panel";
import type { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { useGradeLocked } from "src/app/admin/(dashboard)/grading/page-body/still-writing-confirm";
import { useReportUnsavedGrade } from "src/app/admin/(dashboard)/grading/page-body/unsaved-grade.state";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import type { GradingMode } from "src/lib/grading-mode";
import {
  type ReleaseCorrectAnswersState,
  type ReleaseGradesState,
  type RequestRedoState,
  releaseCorrectAnswersAction,
  releaseGradesAction,
  requestRedoAction,
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

interface BaseGradeFormProps {
  testId: string;
  courseId: string;
  questionId: string;
  studentId: string;
  questionTitle: string;
  questionOrder: number;
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
    <fieldset disabled={locked} className="m-0 min-w-0 space-y-3 border-0 p-0">
      <div className="flex items-center gap-3">
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
              onClick={() => setScore(String(quick))}
            >
              {quick}
            </Button>
          ))}
      </div>

      <div>
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

      <div>
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
// The grade panel and the question-mode rows render it with no card and no
// question heading — those belong to the panel / row.
export { GradeFormInner as CompactGradeForm };

function GradeFormInner({
  testId,
  courseId,
  questionId,
  studentId,
  existingScore,
  existingFeedback,
  existingSolution,
  saveAndNext,
  showQuickScores = false,
  formKey,
  children,
}: BaseGradeFormProps) {
  // The Save & next button sits outside the form, so it targets the form by id.
  const formId = useId();
  const locked = useGradeLocked();
  // The save and its redirect run as one pending action, so the button locks until the next answer opens.
  const [, saveAction, isSaving] = useActionState(
    async (_previous: null, formData: FormData) => {
      await saveAndNextAction(formData);
      return null;
    },
    null,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <form
          key={formKey}
          id={formId}
          action={saveAction}
          className="space-y-3"
        >
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="questionId" value={questionId} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="routeKind" value={saveAndNext.routeKind} />
          <input type="hidden" name="mode" value={saveAndNext.mode} />
          {saveAndNext.needsOnly && (
            <input type="hidden" name="needsOnly" value="1" />
          )}

          <GradeInputs
            questionId={questionId}
            existingScore={existingScore}
            existingFeedback={existingFeedback}
            existingSolution={existingSolution}
            showQuickScores={showQuickScores}
          />
        </form>
        {children}
      </div>

      {/* Outside the form's scroll area so the button stays in view; `form` ties it to it. */}
      <div className="shrink-0 space-y-2">
        {saveAndNext.leftLine && (
          <p className="text-xs text-muted-foreground">
            {saveAndNext.leftLine}
          </p>
        )}
        <Button
          type="submit"
          form={formId}
          size="sm"
          className="w-full"
          disabled={isSaving || locked}
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

// ── RequestRedoButton ────────────────────────────────────────────────────────

interface RequestRedoButtonProps {
  testId: string;
  courseId: string;
  studentId: string;
  /** Whether there is already an active redo request for this student. */
  hasActiveRedoRequest: boolean;
}

export function RequestRedoButton({
  testId,
  courseId,
  studentId,
  hasActiveRedoRequest,
}: RequestRedoButtonProps) {
  const [state, formAction, isPending] = useActionState<
    RequestRedoState | null,
    FormData
  >(requestRedoAction, null);

  if (state?.success || hasActiveRedoRequest) {
    return (
      <p className="shrink-0 whitespace-nowrap text-sm font-medium text-orange-600">
        Redo requested ↩
      </p>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isPending}
        className="border-orange-400 text-orange-700 hover:bg-orange-50"
      >
        {isPending ? "Requesting…" : "Request Redo"}
      </Button>
      {state?.message && !state.success && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}

interface ReleaseGradesButtonProps {
  testId: string;
  courseId: string;
  /** Persisted release date, if already released. Optional so existing
   * standalone renders (no release yet) default to the button. */
  releasedAt?: Date | null;
  /** Button text; the grading pages keep the default. */
  label?: string;
  /** Button style; the grading pages keep the quiet outline. */
  variant?: "outline" | "default";
}

export function ReleaseGradesButton({
  testId,
  courseId,
  releasedAt: persistedReleasedAt = null,
  label = "Release Grades",
  variant = "outline",
}: ReleaseGradesButtonProps) {
  const [state, formAction, isPending] = useActionState<
    ReleaseGradesState | null,
    FormData
  >(releaseGradesAction, null);

  const postActionReleasedAt =
    state?.success && state.releasedAt ? new Date(state.releasedAt) : null;
  const resolvedReleasedAt = postActionReleasedAt ?? persistedReleasedAt;

  if (resolvedReleasedAt) {
    return (
      <p className="text-sm text-muted-foreground">
        {formatReleaseLine("Grades", resolvedReleasedAt)}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <Button type="submit" variant={variant} size="sm" disabled={isPending}>
        {isPending ? "Releasing…" : label}
      </Button>
      {state?.message && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}

interface ReleaseCorrectAnswersButtonProps {
  testId: string;
  courseId: string;
  /** Persisted release date, if already released. Optional so existing
   * standalone renders (no release yet) default to the button. */
  releasedAt?: Date | null;
}

/**
 * Releases correct answers for a test that withheld them, so students can see
 * the answer key from their next visit onward.
 */
export function ReleaseCorrectAnswersButton({
  testId,
  courseId,
  releasedAt: persistedReleasedAt = null,
}: ReleaseCorrectAnswersButtonProps) {
  const [state, formAction, isPending] = useActionState<
    ReleaseCorrectAnswersState | null,
    FormData
  >(releaseCorrectAnswersAction, null);

  const postActionReleasedAt =
    state?.success && state.releasedAt ? new Date(state.releasedAt) : null;
  const resolvedReleasedAt = postActionReleasedAt ?? persistedReleasedAt;

  if (resolvedReleasedAt) {
    return (
      <p className="text-sm text-muted-foreground">
        {formatReleaseLine("Correct answers", resolvedReleasedAt)}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Releasing…" : "Release Correct Answers"}
      </Button>
      {state?.message && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}
