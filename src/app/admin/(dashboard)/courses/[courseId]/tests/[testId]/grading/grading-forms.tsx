"use client";

import { useActionState, useId, useState } from "react";
import { formatReleaseLine } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/test-settings-panel";
import { useReportUnsavedGrade } from "src/app/admin/(dashboard)/grading/page-body/unsaved-grade.state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import { TestStatus } from "src/lib/test-status-service";
import {
  type GradeQuestionState,
  gradeQuestionAction,
  type ReleaseCorrectAnswersState,
  type ReleaseGradesState,
  type RequestRedoState,
  releaseCorrectAnswersAction,
  releaseGradesAction,
  requestRedoAction,
  saveAndJumpToNextAction,
  setTestFeedbackAction,
  type TestFeedbackState,
} from "./actions";

// ── Shared base props ─────────────────────────────────────────────────────────

/**
 * Optional "Save & Next" navigation payload. When set, the grade form
 * renders a second submit button that persists the grade and then jumps
 * to the next ungraded item via the `saveAndJumpToNextAction` server
 * action. See `saveAndJumpToNextAction` for the semantics.
 */
export interface SaveAndNextNavigation {
  /**
   * Comma-separated ids in navigation order. Meaning depends on `mode`:
   * student ids in roster sort order for `"question"`; this student's
   * ordered form-bearing question ids for `"student"`.
   */
  candidateIds: string;
  /** The student id currently focused (the one being graded right now). */
  currentStudentId: string;
  /** Base path the action redirects back to (no query string). */
  returnPath: string;
  /** `"student"` or `"question"` — picks the "next ungraded" rule. */
  mode: "student" | "question";
  /** Current sort criterion, preserved in the redirect target. */
  sort?: string;
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
  studentStatus?: TestStatus;
  /** When present, renders a "Save & Next" button alongside the save. */
  saveAndNext?: SaveAndNextNavigation;
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

  return (
    <>
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
    </>
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
  studentStatus,
  saveAndNext,
  showQuickScores = false,
  formKey,
  children,
}: BaseGradeFormProps) {
  const [state, formAction, isPending] = useActionState<
    GradeQuestionState | null,
    FormData
  >(gradeQuestionAction, null);

  const submitLabel = isPending
    ? "Saving..."
    : existingScore !== null
      ? "Update Grade"
      : "Save Grade";

  const requiresConfirm = studentStatus === TestStatus.InProgress;

  // The confirm dialog is portalled out of the form, so its button targets it by id.
  const formId = useId();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <form
          key={formKey}
          id={formId}
          action={formAction}
          className="space-y-3"
        >
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="questionId" value={questionId} />
          <input type="hidden" name="studentId" value={studentId} />
          {saveAndNext && (
            <>
              <input
                type="hidden"
                name="candidateIds"
                value={saveAndNext.candidateIds}
              />
              <input
                type="hidden"
                name="currentStudentId"
                value={saveAndNext.currentStudentId}
              />
              <input
                type="hidden"
                name="returnPath"
                value={saveAndNext.returnPath}
              />
              <input type="hidden" name="mode" value={saveAndNext.mode} />
              {saveAndNext.sort && (
                <input type="hidden" name="sort" value={saveAndNext.sort} />
              )}
            </>
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

      {/* Outside the form's scroll area so the buttons stay in view; `form` ties them to it. */}
      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-3">
          {requiresConfirm ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="sm" disabled={isPending}>
                  {submitLabel}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit grade anyway?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This student hasn&apos;t submitted their test yet. Are you
                    sure you want to grade their in-progress work?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction type="submit" form={formId}>
                    Submit Anyway
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button type="submit" form={formId} size="sm" disabled={isPending}>
              {submitLabel}
            </Button>
          )}
          {saveAndNext && (
            <Button
              type="submit"
              form={formId}
              size="sm"
              variant="secondary"
              disabled={isPending}
              formAction={saveAndJumpToNextAction}
            >
              Save & Next
            </Button>
          )}
        </div>
        {state?.message && (
          <p
            className={`text-sm ${state.success ? "text-green-600" : "text-destructive"}`}
          >
            {state.message}
          </p>
        )}
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

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium wrap-anywhere">
        Overall feedback for {studentName}
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="testId" value={testId} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="studentId" value={studentId} />

        <label htmlFor={`overall-${studentId}`} className="text-sm font-medium">
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
