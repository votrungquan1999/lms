"use client";

import { useActionState, useState } from "react";
import { OptionalTextField } from "src/components/optional-text-field";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
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
import type { McGradingStrategy } from "src/lib/question-service";
import { submitWithoutReset } from "src/lib/submit-without-reset";
import type { SubmittedMedia } from "../../courses/[courseId]/tests/[testId]/question-media.schema";
import {
  QuestionMediaPickerProvider,
  useQuestionMediaPickerActions,
} from "../../courses/[courseId]/tests/[testId]/question-media-picker.state";
import {
  QuestionMediaFileInput,
  QuestionMediaFileList,
  QuestionTypeSidebar,
} from "../../courses/[courseId]/tests/[testId]/question-media-picker.ui";
import {
  type AddPoolQuestionState,
  addPoolQuestionAction,
} from "../pool-question-actions";

type QuestionType = "free_text" | "single_select" | "multi_select";

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

/** Pool questions can't be `image_answer`, so this pulls only the 3 types they support. */
const TYPE_LABELS: Record<QuestionType, string> = {
  free_text: QUESTION_TYPE_LABELS.free_text,
  single_select: QUESTION_TYPE_LABELS.single_select,
  multi_select: QUESTION_TYPE_LABELS.multi_select,
};

const TYPE_DESCRIPTIONS: Record<QuestionType, string> = {
  free_text: "Open-ended answer — graded manually by the teacher.",
  single_select: "One correct option — auto-graded on submission.",
  multi_select: "Multiple correct options — auto-graded on submission.",
};

/** The two blank options a fresh MC question starts with. */
const INITIAL_OPTIONS: OptionDraft[] = [
  { text: "", isCorrect: false },
  { text: "", isCorrect: false },
];

/**
 * Admin form for authoring a question directly inside a pool. Wraps the body in
 * the shared media picker provider so the submit handler can upload media.
 * @param poolId - The pool the question is added to.
 */
export function AddPoolQuestionForm({ poolId }: { poolId: string }) {
  return (
    <QuestionMediaPickerProvider>
      <AddPoolQuestionFormInner poolId={poolId} />
    </QuestionMediaPickerProvider>
  );
}

/**
 * Form body for authoring a pool question. Mirrors the test `AddQuestionForm`
 * but posts to `addPoolQuestionAction` with a single `poolId` scope.
 */
function AddPoolQuestionFormInner({ poolId }: { poolId: string }) {
  const { uploadSelectedFiles, reset: resetMedia } =
    useQuestionMediaPickerActions();
  const [questionType, setQuestionType] = useState<QuestionType>("free_text");
  const [options, setOptions] = useState<OptionDraft[]>(INITIAL_OPTIONS);
  // Lifted like `questionType` (not a native uncontrolled radio inside the
  // remounted form) so a successful add keeps the chosen strategy instead
  // of resetting it, the same way the chosen type stays selected.
  const [mcGradingStrategy, setMcGradingStrategy] =
    useState<McGradingStrategy>("all_or_nothing");

  const [successCount, setSuccessCount] = useState(0);

  const [state, formAction, isPending] = useActionState<
    AddPoolQuestionState | null,
    FormData
  >(async (_prevState, rawFormData) => {
    rawFormData.set("type", questionType);
    if (questionType !== "free_text") {
      rawFormData.set("options", JSON.stringify(options));
    }
    if (questionType === "multi_select") {
      rawFormData.set("mcGradingStrategy", mcGradingStrategy);
    }

    // Upload media to S3 before creating the question. A failure here aborts
    // the submit — the question is never created and the files are retained.
    let submittedMedia: SubmittedMedia;
    try {
      submittedMedia = await uploadSelectedFiles();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Media upload failed";
      return { success: false, message };
    }
    rawFormData.set("media", JSON.stringify(submittedMedia));
    const result = await addPoolQuestionAction(_prevState, rawFormData);
    if (result.success) {
      setSuccessCount((c) => c + 1);
      setOptions(INITIAL_OPTIONS);
      resetMedia();
    }
    return result;
  }, null);

  const addOption = () =>
    setOptions((prev) => [...prev, { text: "", isCorrect: false }]);

  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx));

  const updateText = (idx: number, text: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, text } : o)));

  const toggleCorrect = (idx: number) =>
    setOptions((prev) =>
      prev.map((o, i) =>
        questionType === "single_select"
          ? { ...o, isCorrect: i === idx }
          : i === idx
            ? { ...o, isCorrect: !o.isCorrect }
            : o,
      ),
    );

  const isMC = questionType !== "free_text";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Add Question</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-0 rounded-lg border overflow-hidden">
          <QuestionTypeSidebar
            options={Object.entries(TYPE_LABELS) as [QuestionType, string][]}
            value={questionType}
            onSelect={setQuestionType}
          />

          <div className="flex-1 p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              {TYPE_DESCRIPTIONS[questionType]}
            </p>

            <form
              key={successCount}
              action={formAction}
              onSubmit={submitWithoutReset(formAction)}
              className="space-y-4"
            >
              <input type="hidden" name="poolId" value={poolId} />

              <div className="space-y-2">
                <Label htmlFor="question-title">Question Title</Label>
                <Input
                  id="question-title"
                  name="title"
                  type="text"
                  required
                  placeholder="e.g. Q1: Arrays"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="question-content">Content (Markdown)</Label>
                <Textarea
                  id="question-content"
                  name="content"
                  placeholder="Paste your markdown content here…"
                  rows={isMC ? 4 : 15}
                  className="font-mono text-sm"
                />
              </div>

              {isMC && (
                <div className="space-y-3">
                  <Label>
                    Options{" "}
                    <span className="text-xs text-muted-foreground">
                      (
                      {questionType === "single_select"
                        ? "pick one correct"
                        : "pick all correct"}
                      )
                    </span>
                  </Label>

                  {options.map((opt, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: option order stable
                    <div key={idx} className="flex items-center gap-2">
                      {questionType === "single_select" ? (
                        <input
                          type="radio"
                          id={`correct-${idx}`}
                          name="correct-option"
                          checked={opt.isCorrect}
                          onChange={() => toggleCorrect(idx)}
                          className="shrink-0"
                          aria-label={`Mark option ${idx + 1} correct`}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          id={`correct-${idx}`}
                          checked={opt.isCorrect}
                          onChange={() => toggleCorrect(idx)}
                          className="shrink-0"
                          aria-label={`Mark option ${idx + 1} correct`}
                        />
                      )}

                      <Input
                        id={`option-text-${idx}`}
                        value={opt.text}
                        onChange={(e) => updateText(idx, e.target.value)}
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

              {/* Multi-select-only: all-or-nothing vs. partial credit */}
              {questionType === "multi_select" && (
                <div className="space-y-1">
                  <Label>Grading</Label>
                  <RadioGroup
                    value={mcGradingStrategy}
                    onValueChange={(value) =>
                      setMcGradingStrategy(value as McGradingStrategy)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="all_or_nothing"
                        id="pool-question-grading-all-or-nothing"
                      />
                      <Label htmlFor="pool-question-grading-all-or-nothing">
                        {MC_GRADING_STRATEGY_LABELS.all_or_nothing}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="partial"
                        id="pool-question-grading-partial"
                      />
                      <Label htmlFor="pool-question-grading-partial">
                        {MC_GRADING_STRATEGY_LABELS.partial}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* Optional explanation, shown to the student once correct answers are revealed */}
              {isMC && (
                <OptionalTextField
                  id="question-explanation"
                  name="explanation"
                  label="Explanation"
                  placeholder="Explain why the correct answer is correct…"
                />
              )}

              {/* Model answer + explanation, shown to the student in practice mode after they answer */}
              {questionType === "free_text" && (
                <div className="space-y-4">
                  <OptionalTextField
                    id="question-reference-answer"
                    name="referenceAnswer"
                    label="Model Answer"
                    placeholder="Write a sample correct answer…"
                  />
                  <OptionalTextField
                    id="question-explanation"
                    name="explanation"
                    label="Explanation"
                    placeholder="Explain what makes a good answer…"
                  />
                  <div className="space-y-1">
                    <Label>{ANSWER_REVEAL_MODE_HEADING}</Label>
                    <RadioGroup name="answerRevealMode" defaultValue="inherit">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="inherit"
                          id="pool-question-answer-reveal-inherit"
                        />
                        <Label htmlFor="pool-question-answer-reveal-inherit">
                          {ANSWER_REVEAL_MODE_INHERIT_LABEL}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="diff"
                          id="pool-question-answer-reveal-diff"
                        />
                        <Label htmlFor="pool-question-answer-reveal-diff">
                          {ANSWER_REVEAL_MODE_LABELS.diff}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="plain"
                          id="pool-question-answer-reveal-plain"
                        />
                        <Label htmlFor="pool-question-answer-reveal-plain">
                          {ANSWER_REVEAL_MODE_LABELS.plain}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <QuestionMediaFileInput />
                <QuestionMediaFileList />
              </div>

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Adding…" : "Add Question"}
              </Button>
            </form>
          </div>
        </div>

        {/* Status messages live outside the row so they render as a
            full-width line below the form instead of a column beside it.
            They also live outside the form so they survive the remount. */}
        {state?.success && (
          <output className="mt-4 block wrap-anywhere rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message}
          </output>
        )}

        {state && !state.success && (
          <div
            className="mt-4 wrap-anywhere rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
