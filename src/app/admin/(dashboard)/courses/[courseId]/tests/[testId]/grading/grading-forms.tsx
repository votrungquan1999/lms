"use client";

import { useActionState } from "react";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import type { McOption } from "src/lib/question-service";
import {
  type GradeQuestionState,
  gradeQuestionAction,
  type ReleaseGradesState,
  releaseGradesAction,
  type RequestRedoState,
  requestRedoAction,
  setTestFeedbackAction,
  type TestFeedbackState,
} from "./actions";

// ── Shared base props ─────────────────────────────────────────────────────────

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
}

// ── Shared primitive: score / feedback / solution inputs ──────────────────────

function GradeInputs({
  questionId,
  existingScore,
  existingFeedback,
  existingSolution,
}: {
  questionId: string;
  existingScore: number | null;
  existingFeedback: string | null;
  existingSolution: string | null;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <label
          htmlFor={`score-${questionId}`}
          className="text-sm font-medium"
        >
          Score (0–100):
        </label>
        <Input
          id={`score-${questionId}`}
          type="number"
          name="score"
          min={0}
          max={100}
          defaultValue={existingScore ?? ""}
          className="w-24"
          required
        />
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
          rows={3}
          className="mt-1 resize-y"
        />
      </div>
    </>
  );
}



// ── FreeTextQuestionGradeForm ─────────────────────────────────────────────────

interface FreeTextQuestionGradeFormProps extends BaseGradeFormProps {
  /** The student's plain-text answer, or null if not submitted. */
  answerText: string | null;
}

export function FreeTextQuestionGradeForm({
  answerText,
  questionTitle,
  questionOrder,
  ...rest
}: FreeTextQuestionGradeFormProps) {
  const answerDisplay = answerText ? (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Student Answer:
      </p>
      <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
        {answerText}
      </pre>
    </div>
  ) : (
    <p className="text-xs italic text-muted-foreground">No answer submitted</p>
  );

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="grade-card">
      <h4 className="font-medium text-sm">
        <span className="text-muted-foreground">#{questionOrder}</span>{" "}
        {questionTitle}
      </h4>
      {answerDisplay}
      {answerText && (
        <GradeFormInner questionTitle={questionTitle} questionOrder={questionOrder} {...rest} />
      )}
    </div>
  );
}

// ── McQuestionGradeForm ───────────────────────────────────────────────────────

interface McQuestionGradeFormProps extends BaseGradeFormProps {
  /** IDs of the options the student selected. */
  selectedIds: string[];
  /** All available options for the question (with isCorrect). */
  options: McOption[];
}

export function McQuestionGradeForm({
  selectedIds,
  options,
  questionTitle,
  questionOrder,
  ...rest
}: McQuestionGradeFormProps) {
  const answerDisplay = (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Student Answer:
      </p>
      <McAnswerChips selectedIds={selectedIds} options={options} />
    </div>
  );

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="grade-card">
      <h4 className="font-medium text-sm">
        <span className="text-muted-foreground">#{questionOrder}</span>{" "}
        {questionTitle}
      </h4>
      {answerDisplay}
      <GradeFormInner questionTitle={questionTitle} questionOrder={questionOrder} {...rest} />
    </div>
  );
}

// ── Internal: grade form inputs only (no outer card) ─────────────────────────

function GradeFormInner({
  testId,
  courseId,
  questionId,
  studentId,
  existingScore,
  existingFeedback,
  existingSolution,
}: BaseGradeFormProps) {
  const [state, formAction, isPending] = useActionState<
    GradeQuestionState | null,
    FormData
  >(gradeQuestionAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="studentId" value={studentId} />

      <GradeInputs
        questionId={questionId}
        existingScore={existingScore}
        existingFeedback={existingFeedback}
        existingSolution={existingSolution}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending
            ? "Saving..."
            : existingScore !== null
              ? "Update Grade"
              : "Save Grade"}
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
  );
}

// ── OverallFeedbackForm ───────────────────────────────────────────────────────

interface OverallFeedbackFormProps {
  testId: string;
  courseId: string;
  studentId: string;
  existingFeedback: string | null;
}

export function OverallFeedbackForm({
  testId,
  courseId,
  studentId,
  existingFeedback,
}: OverallFeedbackFormProps) {
  const [state, formAction, isPending] = useActionState<
    TestFeedbackState | null,
    FormData
  >(setTestFeedbackAction, null);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
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
      <p className="text-sm font-medium text-orange-600">
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
}

export function ReleaseGradesButton({
  testId,
  courseId,
}: ReleaseGradesButtonProps) {
  const [state, formAction, isPending] = useActionState<
    ReleaseGradesState | null,
    FormData
  >(releaseGradesAction, null);

  if (state?.success) {
    return (
      <p className="text-sm font-medium text-green-600">Grades released ✓</p>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Releasing…" : "Release Grades"}
      </Button>
      {state?.message && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}
