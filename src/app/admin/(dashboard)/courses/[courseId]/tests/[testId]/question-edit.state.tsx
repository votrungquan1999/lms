"use client";

import type * as React from "react";
import { useActionState, useRef, useState } from "react";
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
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { Textarea } from "src/components/ui/textarea";
import { isMcQuestion, type Question } from "src/lib/question-service";
import { type UpdateQuestionState, updateQuestionAction } from "./actions";

interface QuestionEditPanelProps {
  question: Question;
  courseId: string;
  /** Distinct answered-student count for this question (Step 23) — gates the D50 confirmation. */
  answeredCount: number;
}

/** One row of the options editor. `id` absent means a genuinely new option (Step 27 / D53). */
interface OptionDraft {
  id?: string;
  text: string;
  isCorrect: boolean;
}

/**
 * D69: true when the editor rows still match the stored options exactly.
 * A keyless MC question (D32/D44) is only editable while an unrelated save
 * leaves `options` out of the payload — the service re-runs the answer-key
 * check whenever the field is supplied, so sending untouched rows would make
 * the "Needs an answer key" badge point at a question nothing can save.
 * Order is part of the comparison: reordering options is a real change.
 */
function optionsUnchanged(
  rows: OptionDraft[],
  stored: { id: string; text: string; isCorrect: boolean }[],
): boolean {
  return (
    rows.length === stored.length &&
    rows.every(
      (row, i) =>
        row.id === stored[i].id &&
        row.text === stored[i].text &&
        row.isCorrect === stored[i].isCorrect,
    )
  );
}

/** Severity wording shown when the options field is among the changed ones — the D29 hazard this step names plainly. */
const OPTIONS_CHANGED_LABEL =
  "the answer options — students who already answered will show as having chosen nothing";

/**
 * Reads the panel's current (uncontrolled) field values from `formData` and
 * names which ones actually differ from `question`'s stored values — the
 * words the D50 confirmation shows. `currentOptions` is the options editor's
 * live state (Step 27) — options aren't plain uncontrolled inputs, so they
 * can't be diffed from `formData` the way every other field is. `null` for a
 * non-MC question, where no options editor renders at all.
 */
function deriveChangedFieldLabels(
  question: Question,
  formData: FormData,
  currentOptions: OptionDraft[] | null,
): string[] {
  const labels: string[] = [];

  const title = formData.get("title")?.toString().trim();
  if (title !== undefined && title !== question.title) {
    labels.push("the title");
  }

  const content = formData.get("content")?.toString();
  if (content !== undefined && content !== question.content) {
    labels.push("the question body");
  }

  if (question.type === "free_text") {
    const rawReveal = formData.get("answerRevealMode")?.toString();
    const reveal = rawReveal === "inherit" ? undefined : rawReveal;
    if (reveal !== question.answerRevealMode) {
      labels.push("how the answer is shown");
    }

    const referenceAnswer =
      formData.get("referenceAnswer")?.toString().trim() || undefined;
    if (referenceAnswer !== question.referenceAnswer) {
      labels.push("the model answer");
    }
  }

  if (question.type === "free_text" || isMcQuestion(question)) {
    const explanation =
      formData.get("explanation")?.toString().trim() || undefined;
    if (explanation !== question.explanation) {
      labels.push("the explanation");
    }
  }

  if (currentOptions !== null && isMcQuestion(question)) {
    const before = question.options.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
    }));
    const after = currentOptions.map((o) => ({
      id: o.id ?? null,
      text: o.text,
      isCorrect: o.isCorrect,
    }));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      labels.push(OPTIONS_CHANGED_LABEL);
    }
  }

  return labels;
}

/**
 * Inline per-question edit panel, following `TestSettingsPanel`'s shape.
 * Title/content are always editable (Step 26 — no question type is
 * exempt). The reveal-mode override and model answer render only for
 * free_text questions (D8); explanation is a column shared by MC and
 * free_text, so both branches get it. Grows with Steps 27-28 (options, type).
 *
 * D29/D50: when at least one student has already answered AND the save
 * would actually change something, Save opens a confirmation naming the
 * specific change instead of submitting directly. The form keeps its normal
 * `action={formAction}` — confirming calls `formRef.current.requestSubmit()`
 * (a real DOM submit, so `useActionState` sees it exactly like a direct
 * click) rather than moving the form itself inside the dialog, since the
 * dialog's content is portaled and the panel's other fields must stay
 * visible on the card behind it.
 */
export function QuestionEditPanel({
  question,
  courseId,
  answeredCount,
}: QuestionEditPanelProps) {
  const isMc = isMcQuestion(question);
  // Options aren't plain uncontrolled inputs (rows can be added/removed), so
  // they're tracked as component state, prefilled from the stored question,
  // and injected into FormData just before the real action runs — same
  // technique `AddQuestionForm` uses for its own (unrelated) options builder.
  const [options, setOptions] = useState<OptionDraft[]>(
    isMc
      ? question.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        }))
      : [],
  );

  const [state, formAction, isPending] = useActionState<
    UpdateQuestionState | null,
    FormData
  >((prevState, formData) => {
    // Omit the field entirely when nothing about the options changed, so the
    // service's answer-key check stays skipped for an unrelated edit (D69).
    const storedOptions = isMcQuestion(question) ? question.options : [];
    if (isMc && !optionsUnchanged(options, storedOptions)) {
      formData.set("options", JSON.stringify(options));
    }
    return updateQuestionAction(prevState, formData);
  }, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingChangeLabels, setPendingChangeLabels] = useState<
    string[] | null
  >(null);
  // Confirming re-submits the same form; this ref tells handleSubmit to let
  // that resubmission through instead of re-opening the dialog.
  const bypassGateRef = useRef(false);

  const isFreeText = question.type === "free_text";

  const addOption = () =>
    setOptions((prev) => [...prev, { text: "", isCorrect: false }]);

  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx));

  const updateOptionText = (idx: number, text: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, text } : o)));

  const toggleOptionCorrect = (idx: number) =>
    setOptions((prev) =>
      prev.map((o, i) =>
        question.type === "single_select"
          ? { ...o, isCorrect: i === idx }
          : i === idx
            ? { ...o, isCorrect: !o.isCorrect }
            : o,
      ),
    );

  /**
   * Gates on the form's actual submit event, not just a Save click — this is
   * also what fires when Enter is pressed inside a lone text field (HTML's
   * implicit submission), which a click-only gate would miss entirely.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (bypassGateRef.current) {
      bypassGateRef.current = false;
      return;
    }

    const changed = deriveChangedFieldLabels(
      question,
      new FormData(event.currentTarget),
      isMc ? options : null,
    );
    if (answeredCount > 0 && changed.length > 0) {
      event.preventDefault();
      setPendingChangeLabels(changed);
    }
  }

  function handleConfirm() {
    setPendingChangeLabels(null);
    bypassGateRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-3 border-t pt-3"
    >
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="testId" value={question.testId} />
      <input type="hidden" name="courseId" value={courseId} />

      <div className="space-y-1">
        <Label htmlFor={`title-${question.id}`}>Title</Label>
        <Input
          id={`title-${question.id}`}
          name="title"
          type="text"
          defaultValue={question.title}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`content-${question.id}`}>Content (Markdown)</Label>
        <Textarea
          id={`content-${question.id}`}
          name="content"
          rows={4}
          className="font-mono text-sm"
          defaultValue={question.content}
        />
      </div>

      {isFreeText && (
        <>
          <OptionalTextField
            id={`reference-answer-${question.id}`}
            name="referenceAnswer"
            label="Model Answer"
            placeholder="Write a sample correct answer…"
            defaultValue={question.referenceAnswer}
          />
          <div className="space-y-1">
            <Label>How this question shows its answer</Label>
            <RadioGroup
              name="answerRevealMode"
              defaultValue={question.answerRevealMode ?? "inherit"}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="inherit"
                  id={`reveal-inherit-${question.id}`}
                />
                <Label htmlFor={`reveal-inherit-${question.id}`}>
                  Inherit from the test
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="diff"
                  id={`reveal-diff-${question.id}`}
                />
                <Label htmlFor={`reveal-diff-${question.id}`}>
                  Show side-by-side for this question
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="plain"
                  id={`reveal-plain-${question.id}`}
                />
                <Label htmlFor={`reveal-plain-${question.id}`}>
                  Show the answer plainly for this question
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
              {question.type === "single_select"
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
              {question.type === "single_select" ? (
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
                id={`option-text-${question.id}-${idx}`}
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

      {(isFreeText || isMcQuestion(question)) && (
        <OptionalTextField
          id={`explanation-${question.id}`}
          name="explanation"
          label="Explanation"
          placeholder="Explain what makes a good answer…"
          defaultValue={question.explanation}
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

      <AlertDialog
        open={pendingChangeLabels !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChangeLabels(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your change</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to change {pendingChangeLabels?.join(", ")} on a
              question{" "}
              {answeredCount === 1
                ? "1 student has"
                : `${answeredCount} students have`}{" "}
              already answered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Saving..." : "Save anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
