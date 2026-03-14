"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import {
  type GradeQuestionState,
  gradeQuestionAction,
  setTestFeedbackAction,
  type TestFeedbackState,
} from "./actions";

interface QuestionGradeFormProps {
  testId: string;
  courseId: string;
  questionId: string;
  studentId: string;
  questionTitle: string;
  questionOrder: number;
  studentAnswer: string | null;
  existingScore: number | null;
  existingFeedback: string | null;
  existingSolution: string | null;
}

export function QuestionGradeForm({
  testId,
  courseId,
  questionId,
  studentId,
  questionTitle,
  questionOrder,
  studentAnswer,
  existingScore,
  existingFeedback,
  existingSolution,
}: QuestionGradeFormProps) {
  const [state, formAction, isPending] = useActionState<
    GradeQuestionState | null,
    FormData
  >(gradeQuestionAction, null);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="font-medium text-sm">
        <span className="text-muted-foreground">#{questionOrder}</span>{" "}
        {questionTitle}
      </h4>

      {studentAnswer ? (
        <>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Student Answer:
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {studentAnswer}
            </pre>
          </div>

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="testId" value={testId} />
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="studentId" value={studentId} />

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
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          No answer submitted
        </p>
      )}
    </div>
  );
}

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
