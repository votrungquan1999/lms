"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Textarea } from "src/components/ui/textarea";
import type { McOption } from "src/lib/question-service";
import { type SubmitAnswerState, submitAnswerAction } from "./actions";

// ── Types ────────────────────────────────────────────────────────────────────

interface BaseProps {
  testId: string;
  courseId: string;
  questionId: string;
}

interface FreeTextProps extends BaseProps {
  questionType: "free_text";
  existingAnswer: string;
  options?: never;
}

interface McProps extends BaseProps {
  questionType: "single_select" | "multi_select";
  options: McOption[];
  /** IDs of options the student previously selected */
  existingSelectedIds: string[];
  existingAnswer?: never;
}

type AnswerFormProps = FreeTextProps | McProps;

// ── Component ────────────────────────────────────────────────────────────────

export function AnswerForm(props: AnswerFormProps) {
  const { testId, courseId, questionId, questionType } = props;
  const isMC = questionType !== "free_text";

  // For MC questions, track currently selected option IDs
  const [selectedIds, setSelectedIds] = useState<string[]>(
    isMC ? props.existingSelectedIds : [],
  );

  const [isEditing, setIsEditing] = useState(
    isMC ? props.existingSelectedIds.length === 0 : !props.existingAnswer,
  );

  const [state, formAction, isPending] = useActionState<
    SubmitAnswerState | null,
    FormData
  >(async (_prevState, rawFormData) => {
    if (isMC) {
      rawFormData.set("selectedIds", JSON.stringify(selectedIds));
    }
    const result = await submitAnswerAction(_prevState, rawFormData);
    if (result.success) {
      setIsEditing(false);
    }
    return result;
  }, null);

  // ── MC read-only view (after submission) ────────────────────────────────
  if (isMC && !isEditing) {
    const options = props.options;
    const saved = selectedIds;
    return (
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/50 p-3 space-y-2">
          {options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 text-sm">
              <span
                className={`size-3 rounded-full shrink-0 ${
                  saved.includes(opt.id)
                    ? "bg-primary"
                    : "bg-muted-foreground/30 border"
                }`}
              />
              <span className={saved.includes(opt.id) ? "font-medium" : ""}>
                {opt.text}
              </span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit Answer
        </Button>
      </div>
    );
  }

  // ── Free-text read-only view ─────────────────────────────────────────────
  if (!isMC && !isEditing) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/50 p-3">
          <p className="whitespace-pre-wrap text-sm">{props.existingAnswer}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit Answer
        </Button>
      </div>
    );
  }

  // ── Editing form ─────────────────────────────────────────────────────────
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="questionId" value={questionId} />

      {isMC ? (
        // MC input: radio (single_select) or checkbox (multi_select)
        <div className="space-y-2">
          {props.options.map((opt) => {
            const checked = selectedIds.includes(opt.id);
            const inputType =
              questionType === "single_select" ? "radio" : "checkbox";
            return (
              <label
                key={opt.id}
                htmlFor={`opt-${opt.id}`}
                className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  id={`opt-${opt.id}`}
                  type={inputType}
                  name="mc-option"
                  checked={checked}
                  onChange={() => {
                    if (questionType === "single_select") {
                      setSelectedIds([opt.id]);
                    } else {
                      setSelectedIds((prev) =>
                        checked
                          ? prev.filter((id) => id !== opt.id)
                          : [...prev, opt.id],
                      );
                    }
                  }}
                  className="shrink-0"
                />
                <span className="text-sm">{opt.text}</span>
              </label>
            );
          })}
        </div>
      ) : (
        // Free-text input
        <Textarea
          name="answer"
          placeholder="Type your answer here..."
          defaultValue={props.existingAnswer}
          rows={5}
          className="resize-y"
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Submit Answer"}
        </Button>

        {(isMC
          ? props.existingSelectedIds.length > 0
          : !!props.existingAnswer) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </Button>
        )}

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
