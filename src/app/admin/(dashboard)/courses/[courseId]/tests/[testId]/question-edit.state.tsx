"use client";

import { Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { Textarea } from "src/components/ui/textarea";
import {
  ANSWER_REVEAL_MODE_HEADING,
  ANSWER_REVEAL_MODE_INHERIT_LABEL,
  ANSWER_REVEAL_MODE_LABELS,
  MC_GRADING_STRATEGY_LABELS,
  QUESTION_TYPE_LABELS,
} from "src/lib/question-labels";
import {
  isMcQuestion,
  isMcQuestionType,
  type Question,
  type QuestionType,
} from "src/lib/question-service";
import { submitWithoutReset } from "src/lib/submit-without-reset";
import {
  deleteQuestionAction,
  type UpdateQuestionState,
  updateQuestionAction,
} from "./actions";

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

/** Severity wording for a type switch (Step 28 / D46) — a blanket statement, since no saved answer survives it. */
const TYPE_CHANGED_LABEL =
  "the question type — this invalidates every answer already given for it";

/** Wording for a grading-rule-only change: names that the rule, not the scoring of past submissions, is what changes. */
const GRADING_STRATEGY_CHANGED_LABEL =
  "the grading rule — applies to future submissions; existing scores stay";

/**
 * Reads the panel's current (uncontrolled) field values from `formData` and
 * names which ones actually differ from `question`'s stored values — the
 * words the D50 confirmation shows. `selectedType`/`currentOptions` are the
 * type switcher's and options editor's live state (Steps 27-28) — neither is
 * a plain uncontrolled input, so they can't be diffed from `formData` the way
 * every other field is. When the type is changing, every other type-specific
 * comparison (reveal mode, model answer, explanation, options) is skipped:
 * D28 wants ONE blanket warning naming that every answer is invalidated,
 * not a pile of now-meaningless per-field diffs against a type that no
 * longer applies. Title/content are unrelated to type, so they still show.
 */
function deriveChangedFieldLabels(
  question: Question,
  formData: FormData,
  selectedType: QuestionType,
  currentOptions: OptionDraft[],
): string[] {
  const labels: string[] = [];

  const typeChanged = selectedType !== question.type;
  if (typeChanged) {
    labels.push(TYPE_CHANGED_LABEL);
  }

  const title = formData.get("title")?.toString().trim();
  if (title !== undefined && title !== question.title) {
    labels.push("the title");
  }

  const content = formData.get("content")?.toString();
  if (content !== undefined && content !== question.content) {
    labels.push("the question body");
  }

  if (!typeChanged && question.type === "free_text") {
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

  if (
    !typeChanged &&
    (question.type === "free_text" || isMcQuestion(question))
  ) {
    const explanation =
      formData.get("explanation")?.toString().trim() || undefined;
    if (explanation !== question.explanation) {
      labels.push("the explanation");
    }
  }

  if (!typeChanged && isMcQuestion(question)) {
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

  if (!typeChanged && question.type === "multi_select") {
    const mcGradingStrategy = formData.get("mcGradingStrategy")?.toString();
    if (
      mcGradingStrategy !== undefined &&
      mcGradingStrategy !== question.mcGradingStrategy
    ) {
      labels.push(GRADING_STRATEGY_CHANGED_LABEL);
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
  // The teacher's live type selection (Step 28) — starts at the question's
  // stored type; switching it reshapes which fields render below, the way
  // `AddQuestionForm`'s sidebar does for a new question.
  const [selectedType, setSelectedType] = useState<QuestionType>(question.type);
  const isFreeText = selectedType === "free_text";
  const isMc = isMcQuestionType(selectedType);

  // The panel may render a field set that doesn't match `question`'s own
  // stored type mid-session (a type switch in progress, not yet saved) — TS
  // narrows `question` by ITS OWN `type`, not `selectedType`, so these reads
  // must be guarded against the union member the field actually lives on.
  const originalReferenceAnswer =
    question.type === "free_text" ? question.referenceAnswer : undefined;
  const originalAnswerRevealMode =
    question.type === "free_text" ? question.answerRevealMode : undefined;
  const originalExplanation =
    question.type === "free_text" || isMcQuestion(question)
      ? question.explanation
      : undefined;
  const originalMcGradingStrategy =
    question.type === "multi_select" ? question.mcGradingStrategy : undefined;

  // Options aren't plain uncontrolled inputs (rows can be added/removed), so
  // they're tracked as component state, prefilled from the stored question,
  // and injected into FormData just before the real action runs — same
  // technique `AddQuestionForm` uses for its own (unrelated) options builder.
  const [options, setOptions] = useState<OptionDraft[]>(
    isMcQuestion(question)
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

  /**
   * Switching type is an event, not an effect — seeding two blank option
   * rows the moment a non-MC question is switched INTO an MC type is a
   * direct response to that click, not a sync with an external resource.
   */
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

  // Both the post-confirm resubmit (below) and the no-confirmation-needed
  // fallthrough go through this — only the dialog-opening branch is a pure
  // gate with no submit of its own.
  const submitAction = submitWithoutReset(formAction);

  /**
   * Gates on the form's actual submit event, not just a Save click — this is
   * also what fires when Enter is pressed inside a lone text field (HTML's
   * implicit submission), which a click-only gate would miss entirely.
   */
  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    if (bypassGateRef.current) {
      bypassGateRef.current = false;
      submitAction(event);
      return;
    }

    const changed = deriveChangedFieldLabels(
      question,
      new FormData(event.currentTarget),
      selectedType,
      options,
    );
    if (answeredCount > 0 && changed.length > 0) {
      event.preventDefault();
      setPendingChangeLabels(changed);
      return;
    }

    submitAction(event);
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
              id={`type-free-text-${question.id}`}
            />
            <Label htmlFor={`type-free-text-${question.id}`}>
              {QUESTION_TYPE_LABELS.free_text}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="single_select"
              id={`type-single-select-${question.id}`}
            />
            <Label htmlFor={`type-single-select-${question.id}`}>
              {QUESTION_TYPE_LABELS.single_select}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="multi_select"
              id={`type-multi-select-${question.id}`}
            />
            <Label htmlFor={`type-multi-select-${question.id}`}>
              {QUESTION_TYPE_LABELS.multi_select}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="image_answer"
              id={`type-image-answer-${question.id}`}
            />
            <Label htmlFor={`type-image-answer-${question.id}`}>
              {QUESTION_TYPE_LABELS.image_answer}
            </Label>
          </div>
        </RadioGroup>
      </div>

      {isFreeText && (
        <>
          <OptionalTextField
            id={`reference-answer-${question.id}`}
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
                  id={`reveal-inherit-${question.id}`}
                />
                <Label htmlFor={`reveal-inherit-${question.id}`}>
                  {ANSWER_REVEAL_MODE_INHERIT_LABEL}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="diff"
                  id={`reveal-diff-${question.id}`}
                />
                <Label htmlFor={`reveal-diff-${question.id}`}>
                  {ANSWER_REVEAL_MODE_LABELS.diff}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="plain"
                  id={`reveal-plain-${question.id}`}
                />
                <Label htmlFor={`reveal-plain-${question.id}`}>
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

      {selectedType === "multi_select" && (
        <div className="space-y-1">
          <Label>Grading</Label>
          <RadioGroup
            name="mcGradingStrategy"
            defaultValue={originalMcGradingStrategy ?? "all_or_nothing"}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="all_or_nothing"
                id={`grading-all-or-nothing-${question.id}`}
              />
              <Label htmlFor={`grading-all-or-nothing-${question.id}`}>
                {MC_GRADING_STRATEGY_LABELS.all_or_nothing}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="partial"
                id={`grading-partial-${question.id}`}
              />
              <Label htmlFor={`grading-partial-${question.id}`}>
                {MC_GRADING_STRATEGY_LABELS.partial}
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {(isFreeText || isMc) && (
        <OptionalTextField
          id={`explanation-${question.id}`}
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

interface DeleteQuestionButtonProps {
  questionId: string;
  testId: string;
  courseId: string;
  /** Distinct answered-student count for this question (Step 23) — wording depends on it. */
  answeredCount: number;
}

/**
 * Delete control for a question (Step 29 / D37/D47). Rendered unconditionally
 * for every question type in `question-list.tsx` — unlike `QuestionEditPanel`,
 * which only exists for free_text/MC, delete must also reach `image_answer`
 * questions. The delete is soft; the confirmation names the real consequence
 * (D33 vs this step's own hazard are NOT the same): a deleted question leaves
 * both halves of `getAverageScore`, so an affected student's overall score
 * CHANGES — it does not reset to zero.
 */
export function DeleteQuestionButton({
  questionId,
  testId,
  courseId,
  answeredCount,
}: DeleteQuestionButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteQuestionAction,
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
              This removes the question from the test; it can't be restored.
              {answeredCount > 0 &&
                ` ${
                  answeredCount === 1
                    ? "1 student has"
                    : `${answeredCount} students have`
                } already answered it — deleting it changes their overall score; it does not become zero.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={formAction}>
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="testId" value={testId} />
            <input type="hidden" name="courseId" value={courseId} />
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

      {state?.success && (
        <output className="mt-2 block text-sm text-emerald-600">
          {state.message}
        </output>
      )}
      {state && !state.success && (
        <div className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </div>
      )}
    </>
  );
}
