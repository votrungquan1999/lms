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

/**
 * Admin form for adding a question to a test.
 * Layout: sidebar (type picker) on the left, form panel on the right.
 */
export function AddQuestionForm({
  testId,
  courseId,
}: {
  testId: string;
  courseId: string;
}) {
  const [questionType, setQuestionType] = useState<QuestionType>("free_text");
  const [options, setOptions] = useState<OptionDraft[]>([
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);

  const [state, formAction, isPending] = useActionState<
    AddQuestionState | null,
    FormData
  >(async (_prevState, rawFormData) => {
    rawFormData.set("type", questionType);
    if (questionType !== "free_text") {
      rawFormData.set("options", JSON.stringify(options));
    }
    return addQuestionAction(_prevState, rawFormData);
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
          <aside className="w-40 shrink-0 border-r bg-muted/40 flex flex-col">
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setQuestionType(t)}
                className={[
                  "px-4 py-3 text-left text-sm font-medium transition-colors",
                  "border-b last:border-b-0",
                  questionType === t
                    ? "bg-background text-primary border-l-2 border-l-primary pl-[14px]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </aside>

          {/* ── Right panel: question form ──────────────────────────────── */}
          <div className="flex-1 p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              {TYPE_DESCRIPTIONS[questionType]}
            </p>

            <form action={formAction} className="space-y-4">
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
                  required
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

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Adding…" : "Add Question"}
              </Button>
            </form>

            {state?.success && (
              <output className="mt-4 block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                {state.message}
              </output>
            )}

            {state && !state.success && (
              <div
                className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {state.message}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
