"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { type AddQuestionState, addQuestionAction } from "./actions";
import type { SubmittedMedia } from "./question-media.schema";
import {
  QuestionMediaPickerProvider,
  useQuestionMediaPickerActions,
} from "./question-media-picker.state";
import {
  QuestionMediaFileInput,
  QuestionMediaFileList,
  QuestionTypeSidebar,
} from "./question-media-picker.ui";

type QuestionType = "free_text" | "single_select" | "multi_select";

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  free_text: "Free Text",
  single_select: "Single Select",
  multi_select: "Multi Select",
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
 * Admin form for adding a question to a test. Wraps the form body in the media
 * picker provider so the submit handler can upload selected media.
 * @param testId - The test the question is added to.
 * @param courseId - The owning course (for revalidation paths).
 */
export function AddQuestionForm({
  testId,
  courseId,
}: {
  testId: string;
  courseId: string;
}) {
  return (
    <QuestionMediaPickerProvider>
      <AddQuestionFormInner testId={testId} courseId={courseId} />
    </QuestionMediaPickerProvider>
  );
}

/**
 * Form body for adding a question. Runs inside QuestionMediaPickerProvider so
 * the submit handler can read selected files and upload them before creating
 * the question.
 * Layout: sidebar (type picker) on the left, form panel on the right.
 */
function AddQuestionFormInner({
  testId,
  courseId,
}: {
  testId: string;
  courseId: string;
}) {
  const { uploadSelectedFiles, reset: resetMedia } =
    useQuestionMediaPickerActions();
  const [questionType, setQuestionType] = useState<QuestionType>("free_text");
  const [options, setOptions] = useState<OptionDraft[]>(INITIAL_OPTIONS);

  const [successCount, setSuccessCount] = useState(0);

  const [state, formAction, isPending] = useActionState<
    AddQuestionState | null,
    FormData
  >(async (_prevState, rawFormData) => {
    rawFormData.set("type", questionType);
    if (questionType !== "free_text") {
      rawFormData.set("options", JSON.stringify(options));
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
    const result = await addQuestionAction(_prevState, rawFormData);
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
          {/* ── Left sidebar: type picker ───────────────────────────────── */}
          <QuestionTypeSidebar
            options={Object.entries(TYPE_LABELS) as [QuestionType, string][]}
            value={questionType}
            onSelect={setQuestionType}
          />

          {/* ── Right panel: question form ──────────────────────────────── */}
          <div className="flex-1 p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              {TYPE_DESCRIPTIONS[questionType]}
            </p>

            <form key={successCount} action={formAction} className="space-y-4">
              <input type="hidden" name="testId" value={testId} />
              <input type="hidden" name="courseId" value={courseId} />

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

              {/* MC options builder */}
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
                      {/* Correct-answer marker */}
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

              {/* Media picker */}
              <div className="space-y-2">
                <QuestionMediaFileInput />
                <QuestionMediaFileList />
              </div>

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Adding…" : "Add Question"}
              </Button>
            </form>
          </div>

          {/* Status messages live outside the form so they survive the remount */}
          {state?.success && (
            <output className="mt-2 block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              {state.message}
            </output>
          )}

          {state && !state.success && (
            <div
              className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {state.message}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
