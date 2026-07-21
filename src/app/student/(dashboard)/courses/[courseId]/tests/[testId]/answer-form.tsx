"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import type { McOption } from "src/lib/question-service";
import { type SubmitAnswerState, submitAnswerAction } from "./actions";
import {
  AnswerImagePickerProvider,
  useAnswerImagePickerActions,
  useAnswerImagePickerState,
} from "./answer-image-picker.state";

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

interface ImageProps extends BaseProps {
  questionType: "image_answer";
  /** Number of photos the student previously submitted (0 when none). */
  existingImageCount: number;
  options?: never;
  existingAnswer?: never;
}

type AnswerFormProps = FreeTextProps | McProps | ImageProps;

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Student answer form. Wraps the body in the answer-image picker provider so
 * image-answer questions can upload photos before submitting.
 * @param props - Discriminated by `questionType`.
 */
export function AnswerForm(props: AnswerFormProps) {
  return (
    <AnswerImagePickerProvider>
      <AnswerFormInner {...props} />
    </AnswerImagePickerProvider>
  );
}

function AnswerFormInner(props: AnswerFormProps) {
  const { testId, courseId, questionId, questionType } = props;
  // Inline discriminant (not the isMcQuestionType helper): this exact aliased
  // form is what lets TS narrow the AnswerFormProps union to the MC variant.
  const isMC =
    questionType === "single_select" || questionType === "multi_select";
  const isImage = questionType === "image_answer";
  const imagePicker = useAnswerImagePickerState();
  const imageActions = useAnswerImagePickerActions();

  // For MC questions, track currently selected option IDs
  const [selectedIds, setSelectedIds] = useState<string[]>(
    isMC ? props.existingSelectedIds : [],
  );

  const [isEditing, setIsEditing] = useState(() => {
    if (isMC) return props.existingSelectedIds.length === 0;
    if (isImage) return props.existingImageCount === 0;
    return !props.existingAnswer;
  });

  const [state, formAction, isPending] = useActionState<
    SubmitAnswerState | null,
    FormData
  >(async (_prevState, rawFormData) => {
    if (isMC) {
      rawFormData.set("selectedIds", JSON.stringify(selectedIds));
    }
    if (isImage) {
      // Upload the selected photos to S3, then attach their keys to the answer.
      // A failure here aborts the submit — the answer is never created.
      let mediaKeys: string[];
      try {
        mediaKeys = await imageActions.uploadSelectedFiles();
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : "Photo upload failed",
        };
      }
      rawFormData.set("mediaKeys", JSON.stringify(mediaKeys));
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

  // ── Image-answer read-only view ──────────────────────────────────────────
  if (isImage && !isEditing) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/50 p-3 text-sm">
          {props.existingImageCount} photo
          {props.existingImageCount === 1 ? "" : "s"} submitted.
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit Answer
        </Button>
      </div>
    );
  }

  // ── Free-text read-only view ─────────────────────────────────────────────
  if (questionType === "free_text" && !isEditing) {
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
      ) : isImage ? (
        // Image-answer input: photo picker
        <div className="space-y-2">
          <label htmlFor="answer-photos" className="text-sm font-medium">
            Your photos
          </label>
          <Input
            id="answer-photos"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => {
              imageActions.addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          {imagePicker.selectedFiles.length > 0 && (
            <ul className="grid gap-1" aria-label="Selected photos">
              {imagePicker.selectedFiles.map((selected) => (
                <li
                  key={selected.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{selected.file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${selected.file.name}`}
                    onClick={() => imageActions.removeFile(selected.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {imagePicker.validationError && (
            <p className="text-sm text-destructive">
              {imagePicker.validationError}
            </p>
          )}
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
          : isImage
            ? props.existingImageCount > 0
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
