"use client";

import { Trash2 } from "lucide-react";
import {
  type RefObject,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { OptionalTextField } from "src/components/optional-text-field";
import { QuestionEditModal } from "src/components/question-edit-modal.state";
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
  MC_GRADING_STRATEGY_LABELS,
  QUESTION_TYPE_LABELS,
} from "src/lib/question-labels";
import { MAX_MEDIA_PER_QUESTION } from "src/lib/question-media-merge";
import {
  isMcQuestionType,
  type QuestionMedia,
  type QuestionType,
} from "src/lib/question-service";
import { submitWithoutReset } from "src/lib/submit-without-reset";
import { KeptMediaList } from "../../courses/[courseId]/tests/[testId]/question-kept-media.ui";
import {
  QuestionMediaPickerProvider,
  useQuestionMediaPickerActions,
  useQuestionMediaPickerState,
} from "../../courses/[courseId]/tests/[testId]/question-media-picker.state";
import {
  QuestionMediaFileInput,
  QuestionMediaFileList,
} from "../../courses/[courseId]/tests/[testId]/question-media-picker.ui";
import {
  deletePoolQuestionAction,
  updatePoolQuestionAction,
} from "../pool-question-actions";

interface PoolQuestionEditButtonProps {
  question: PoolQuestion;
  poolId: string;
}

interface PoolQuestionEditPanelProps extends PoolQuestionEditButtonProps {
  /** Called after a successful save so the hosting modal can close. */
  onSaved?: () => void;
  /** Called by Cancel to leave the modal without saving. */
  requestClose?: () => void;
  /** The form registers its "has unsaved changes" check here. */
  dirtyCheckRef?: RefObject<(() => boolean) | null>;
  /** Raised while a save runs, so the modal cannot be closed meanwhile. */
  savingRef?: RefObject<boolean>;
}

interface PoolQuestionEditFormProps extends PoolQuestionEditPanelProps {
  /** The pictures and videos the question keeps so far (removals applied). */
  keptMedia: QuestionMedia[];
  /** Drops one kept picture or video by key. */
  onRemoveKept: (key: string) => void;
}

/** One row of the options editor. `id` absent means a genuinely new option (D53). */
interface OptionDraft {
  id?: string;
  text: string;
  isCorrect: boolean;
}

/**
 * Whether the form's live values differ from the stored question.
 * @param question - The stored question.
 * @param formData - The form's current uncontrolled fields.
 * @param selectedType - The type radio's live value.
 * @param options - The options editor's live rows.
 * @param picturesChanged - Whether pictures were removed or files picked.
 */
function hasUnsavedChanges(
  question: PoolQuestion,
  formData: FormData,
  selectedType: QuestionType,
  options: OptionDraft[],
  picturesChanged: boolean,
): boolean {
  if (picturesChanged || selectedType !== question.type) return true;
  if (formData.get("title")?.toString().trim() !== question.title) return true;
  if (formData.get("content")?.toString() !== question.content) return true;

  const explanation =
    formData.get("explanation")?.toString().trim() || undefined;
  if (explanation !== question.explanation) return true;

  if (question.type === "free_text") {
    const rawReveal = formData.get("answerRevealMode")?.toString();
    const reveal = rawReveal === "inherit" ? undefined : rawReveal;
    if (reveal !== question.answerRevealMode) return true;
    const referenceAnswer =
      formData.get("referenceAnswer")?.toString().trim() || undefined;
    if (referenceAnswer !== question.referenceAnswer) return true;
    return false;
  }

  const stored = question.options.map((o) => ({
    id: o.id,
    text: o.text,
    isCorrect: o.isCorrect,
  }));
  const live = options.map((o) => ({
    id: o.id,
    text: o.text,
    isCorrect: o.isCorrect,
  }));
  if (JSON.stringify(stored) !== JSON.stringify(live)) return true;
  if (question.type === "multi_select") {
    return formData.get("mcGradingStrategy") !== question.mcGradingStrategy;
  }
  return false;
}

/**
 * Edit form for one Question Bank question, hosted in the Edit modal. A
 * parallel implementation to `QuestionEditPanel`, not a shared one. Pool
 * questions carry no student answers, so every save submits directly.
 */
function PoolQuestionEditForm({
  question,
  poolId,
  onSaved,
  requestClose,
  dirtyCheckRef,
  savingRef,
  keptMedia,
  onRemoveKept,
}: PoolQuestionEditFormProps) {
  const { selectedFiles } = useQuestionMediaPickerState();
  const { uploadSelectedFiles } = useQuestionMediaPickerActions();
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
  const originalMcGradingStrategy =
    question.type === "multi_select" ? question.mcGradingStrategy : undefined;

  // Kept pictures are only ever removed, so a shorter list means a change
  const picturesChanged =
    keptMedia.length !== question.media.length || selectedFiles.length > 0;

  const [state, formAction, isPending] = useActionState(
    async (
      prevState: Awaited<ReturnType<typeof updatePoolQuestionAction>> | null,
      formData: FormData,
    ) => {
      if (savingRef) savingRef.current = true;
      try {
        return await saveQuestion(prevState, formData);
      } finally {
        if (savingRef) savingRef.current = false;
      }
    },
    null,
  );

  /** Uploads new files, then sends the one save. */
  async function saveQuestion(
    prevState: Awaited<ReturnType<typeof updatePoolQuestionAction>> | null,
    formData: FormData,
  ) {
    if (isMc) {
      formData.set("options", JSON.stringify(options));
    }
    // New files upload first so the one save below carries the final list
    if (picturesChanged) {
      try {
        const uploaded = await uploadSelectedFiles();
        formData.set(
          "media",
          JSON.stringify([
            ...keptMedia.map(({ key }) => ({ key })),
            ...uploaded,
          ]),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed";
        return { success: false, message };
      }
    }
    const result = await updatePoolQuestionAction(prevState, formData);
    if (result.success) onSaved?.();
    return result;
  }
  const formRef = useRef<HTMLFormElement>(null);

  // Lets the modal ask, on a close request, whether anything differs from the stored question.
  useEffect(() => {
    if (!dirtyCheckRef) return;
    dirtyCheckRef.current = () =>
      formRef.current !== null &&
      hasUnsavedChanges(
        question,
        new FormData(formRef.current),
        selectedType,
        options,
        picturesChanged,
      );
    return () => {
      dirtyCheckRef.current = null;
    };
  }, [dirtyCheckRef, question, selectedType, options, picturesChanged]);

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
    <form
      ref={formRef}
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className="space-y-3 border-t pt-3"
    >
      <input type="hidden" name="poolQuestionId" value={question.id} />
      <input type="hidden" name="poolId" value={poolId} />

      {/* Locks every field while a save runs, so the saved values match what is on screen. */}
      <fieldset disabled={isPending} className="min-w-0 space-y-3">
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

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOption}
            >
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
                  id={`pool-grading-all-or-nothing-${question.id}`}
                />
                <Label htmlFor={`pool-grading-all-or-nothing-${question.id}`}>
                  {MC_GRADING_STRATEGY_LABELS.all_or_nothing}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="partial"
                  id={`pool-grading-partial-${question.id}`}
                />
                <Label htmlFor={`pool-grading-partial-${question.id}`}>
                  {MC_GRADING_STRATEGY_LABELS.partial}
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        <div className="space-y-2">
          <KeptMediaList media={keptMedia} onRemove={onRemoveKept} />
          <QuestionMediaFileInput id={`pool-media-files-${question.id}`} />
          <QuestionMediaFileList />
        </div>

        {(isFreeText || isMc) && (
          <OptionalTextField
            id={`pool-explanation-${question.id}`}
            name="explanation"
            label="Explanation"
            placeholder="Explain what makes a good answer…"
            defaultValue={originalExplanation}
          />
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending} size="sm">
            {isPending ? "Saving..." : "Save"}
          </Button>
          {requestClose && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={requestClose}
            >
              Cancel
            </Button>
          )}
        </div>
      </fieldset>

      {state && !state.success && (
        <div className="text-sm text-destructive" role="alert">
          {state.message}
        </div>
      )}
    </form>
  );
}

/**
 * Edit form plus picture controls for one Question Bank question. Owns the
 * kept-media list so the new-file picker is capped at what the question has
 * room for.
 * @param props - The question, its pool id and the modal hooks.
 */
export function PoolQuestionEditPanel(props: PoolQuestionEditPanelProps) {
  const [keptMedia, setKeptMedia] = useState<QuestionMedia[]>(
    props.question.media,
  );

  return (
    <QuestionMediaPickerProvider
      maxFiles={MAX_MEDIA_PER_QUESTION - keptMedia.length}
    >
      <PoolQuestionEditForm
        {...props}
        keptMedia={keptMedia}
        onRemoveKept={(key) =>
          setKeptMedia((prev) => prev.filter((entry) => entry.key !== key))
        }
      />
    </QuestionMediaPickerProvider>
  );
}

/**
 * Edit button for one Question Bank question: opens the shared Edit modal
 * around `PoolQuestionEditPanel`.
 * @param props - The question being edited and its pool id.
 */
export function PoolQuestionEditButton({
  question,
  poolId,
}: PoolQuestionEditButtonProps) {
  return (
    <QuestionEditModal>
      {({ onSaved, requestClose, dirtyCheckRef, savingRef }) => (
        <PoolQuestionEditPanel
          question={question}
          poolId={poolId}
          onSaved={onSaved}
          requestClose={requestClose}
          dirtyCheckRef={dirtyCheckRef}
          savingRef={savingRef}
        />
      )}
    </QuestionEditModal>
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
