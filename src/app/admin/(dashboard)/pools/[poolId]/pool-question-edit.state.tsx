"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { OptionalTextField } from "src/components/optional-text-field";
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
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { Textarea } from "src/components/ui/textarea";
import type { PoolQuestion } from "src/lib/pool-question-service";
import {
  ANSWER_REVEAL_MODE_HEADING,
  ANSWER_REVEAL_MODE_INHERIT_LABEL,
  ANSWER_REVEAL_MODE_LABELS,
  QUESTION_TYPE_LABELS,
} from "src/lib/question-labels";
import { isMcQuestionType, type QuestionType } from "src/lib/question-service";
import {
  deletePoolQuestionAction,
  updatePoolQuestionAction,
} from "../pool-question-actions";

interface PoolQuestionEditPanelProps {
  question: PoolQuestion;
  poolId: string;
}

/** One row of the options editor. `id` absent means a genuinely new option (D53). */
interface OptionDraft {
  id?: string;
  text: string;
  isCorrect: boolean;
}

/**
 * Inline per-pool-question edit panel (Step 30 / D30 / D51) — a parallel
 * implementation to `QuestionEditPanel`, not a shared one. Pool questions
 * carry no student answers, so there is no confirmation modal here: every
 * save submits directly.
 */
export function PoolQuestionEditPanel({
  question,
  poolId,
}: PoolQuestionEditPanelProps) {
  const [selectedType, setSelectedType] = useState<QuestionType>(question.type);
  const isFreeText = selectedType === "free_text";
  const isMc = isMcQuestionType(selectedType);

  const [options, setOptions] = useState<OptionDraft[]>(
    question.type !== "free_text"
      ? question.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        }))
      : [],
  );

  const originalReferenceAnswer =
    question.type === "free_text" ? question.referenceAnswer : undefined;
  const originalAnswerRevealMode =
    question.type === "free_text" ? question.answerRevealMode : undefined;
  const originalExplanation =
    question.type !== "free_text" || question.explanation !== undefined
      ? question.explanation
      : undefined;

  const [state, formAction, isPending] = useActionState(
    (
      prevState: Awaited<ReturnType<typeof updatePoolQuestionAction>> | null,
      formData: FormData,
    ) => {
      if (isMc) {
        formData.set("options", JSON.stringify(options));
      }
      return updatePoolQuestionAction(prevState, formData);
    },
    null,
  );

  function handleTypeSelect(newType: QuestionType) {
    setSelectedType(newType);
    if (isMcQuestionType(newType)) {
      setOptions((prev) =>
        prev.length > 0
          ? prev
          : [
              { text: "", isCorrect: false },
              { text: "", isCorrect: false },
            ],
      );
    }
  }

  const addOption = () =>
    setOptions((prev) => [...prev, { text: "", isCorrect: false }]);

  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx));

  const updateOptionText = (idx: number, text: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, text } : o)));

  const toggleOptionCorrect = (idx: number) =>
    setOptions((prev) =>
      prev.map((o, i) =>
        selectedType === "single_select"
          ? { ...o, isCorrect: i === idx }
          : i === idx
            ? { ...o, isCorrect: !o.isCorrect }
            : o,
      ),
    );

  return (
    <form action={formAction} className="space-y-3 border-t pt-3">
      <input type="hidden" name="poolQuestionId" value={question.id} />
      <input type="hidden" name="poolId" value={poolId} />

      <div className="space-y-1">
        <Label htmlFor={`pool-title-${question.id}`}>Title</Label>
        <Input
          id={`pool-title-${question.id}`}
          name="title"
          type="text"
          defaultValue={question.title}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`pool-content-${question.id}`}>
          Content (Markdown)
        </Label>
        <Textarea
          id={`pool-content-${question.id}`}
          name="content"
          rows={4}
          className="font-mono text-sm"
          defaultValue={question.content}
        />
      </div>

      <div className="space-y-1">
        <Label>Question type</Label>
        <RadioGroup
          name="type"
          value={selectedType}
          onValueChange={(value) => handleTypeSelect(value as QuestionType)}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="free_text"
              id={`pool-type-free-text-${question.id}`}
            />
            <Label htmlFor={`pool-type-free-text-${question.id}`}>
              {QUESTION_TYPE_LABELS.free_text}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="single_select"
              id={`pool-type-single-select-${question.id}`}
            />
            <Label htmlFor={`pool-type-single-select-${question.id}`}>
              {QUESTION_TYPE_LABELS.single_select}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="multi_select"
              id={`pool-type-multi-select-${question.id}`}
            />
            <Label htmlFor={`pool-type-multi-select-${question.id}`}>
              {QUESTION_TYPE_LABELS.multi_select}
            </Label>
          </div>
        </RadioGroup>
      </div>

      {isFreeText && (
        <>
          <OptionalTextField
            id={`pool-reference-answer-${question.id}`}
            name="referenceAnswer"
            label="Model Answer"
            placeholder="Write a sample correct answer…"
            defaultValue={originalReferenceAnswer}
          />
          <div className="space-y-1">
            <Label>{ANSWER_REVEAL_MODE_HEADING}</Label>
            <RadioGroup
              name="answerRevealMode"
              defaultValue={originalAnswerRevealMode ?? "inherit"}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="inherit"
                  id={`pool-reveal-inherit-${question.id}`}
                />
                <Label htmlFor={`pool-reveal-inherit-${question.id}`}>
                  {ANSWER_REVEAL_MODE_INHERIT_LABEL}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="diff"
                  id={`pool-reveal-diff-${question.id}`}
                />
                <Label htmlFor={`pool-reveal-diff-${question.id}`}>
                  {ANSWER_REVEAL_MODE_LABELS.diff}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="plain"
                  id={`pool-reveal-plain-${question.id}`}
                />
                <Label htmlFor={`pool-reveal-plain-${question.id}`}>
                  {ANSWER_REVEAL_MODE_LABELS.plain}
                </Label>
              </div>
            </RadioGroup>
          </div>
        </>
      )}

      {isMc && (
        <div className="space-y-3">
          <Label>
            Options{" "}
            <span className="text-xs text-muted-foreground">
              (
              {selectedType === "single_select"
                ? "pick one correct"
                : "pick all correct"}
              )
            </span>
          </Label>

          {options.map((opt, idx) => (
            <div
              key={opt.id ?? `new-${idx}`}
              className="flex items-center gap-2"
            >
              {selectedType === "single_select" ? (
                <input
                  type="radio"
                  checked={opt.isCorrect}
                  onChange={() => toggleOptionCorrect(idx)}
                  className="shrink-0"
                  aria-label={`Mark option ${idx + 1} correct`}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={opt.isCorrect}
                  onChange={() => toggleOptionCorrect(idx)}
                  className="shrink-0"
                  aria-label={`Mark option ${idx + 1} correct`}
                />
              )}

              <Input
                id={`pool-option-text-${question.id}-${idx}`}
                value={opt.text}
                onChange={(e) => updateOptionText(idx, e.target.value)}
                placeholder={`Option ${idx + 1}`}
                className="flex-1"
              />

              {options.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOption(idx)}
                  className="text-destructive hover:text-destructive px-2"
                >
                  ✕
                </Button>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            + Add Option
          </Button>
        </div>
      )}

      {(isFreeText || isMc) && (
        <OptionalTextField
          id={`pool-explanation-${question.id}`}
          name="explanation"
          label="Explanation"
          placeholder="Explain what makes a good answer…"
          defaultValue={originalExplanation}
        />
      )}

      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? "Saving..." : "Save"}
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
  );
}

interface DeletePoolQuestionButtonProps {
  poolQuestionId: string;
  poolId: string;
}

/**
 * Delete control for a pool question (Step 30 / D37/D51) — the safest
 * possible delete: pool questions have no answers, no grades, and composed
 * copies already share no references with the pool, so no severity wording
 * is needed here (unlike `DeleteQuestionButton`'s test-question warning).
 */
export function DeletePoolQuestionButton({
  poolQuestionId,
  poolId,
}: DeletePoolQuestionButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deletePoolQuestionAction,
    null,
  );

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete question</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the question from the pool; it can't be restored.
              Tests already composed from it keep their own copy unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={formAction}>
            <input type="hidden" name="poolQuestionId" value={poolQuestionId} />
            <input type="hidden" name="poolId" value={poolId} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending}
                >
                  {isPending ? "Deleting..." : "Delete"}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {state && !state.success && (
        <div className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </div>
      )}
    </>
  );
}
