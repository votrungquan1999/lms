"use client";

import { useActionState, useState } from "react";
import { ExpectedSchoolField } from "src/components/expected-school-field";
import {
  FreeTextAnswerControl,
  ImageAnswerControl,
  McAnswerControls,
} from "src/components/student-answer-controls.ui";
import type { StudentOption } from "src/components/student-question-card.ui";
import { Button } from "src/components/ui/button";
import { submitWithoutReset } from "src/lib/submit-without-reset";
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
  schoolId: string;
}

interface FreeTextProps extends BaseProps {
  questionType: "free_text";
  existingAnswer: string;
  options?: never;
}

interface McProps extends BaseProps {
  questionType: "single_select" | "multi_select";
  options: StudentOption[];
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
  const { testId, courseId, questionId, schoolId, questionType } = props;
  // Inline discriminant (not the isMcQuestionType helper): this exact aliased
  // form is what lets TS narrow the AnswerFormProps union to the MC variant.
  const isMC =
    questionType === "single_select" || questionType === "multi_select";
  const isImage = questionType === "image_answer";
  const isFreeText = questionType === "free_text";
  const imagePicker = useAnswerImagePickerState();
  const imageActions = useAnswerImagePickerActions();

  // For MC questions, track currently selected option IDs
  const [selectedIds, setSelectedIds] = useState<string[]>(
    isMC ? props.existingSelectedIds : [],
  );

  // Controlled so a refused submit can't silently revert it (React 19 resets
  // uncontrolled fields) and so canSubmit can read it below.
  const [text, setText] = useState<string>(
    isFreeText ? props.existingAnswer : "",
  );

  const [isEditing, setIsEditing] = useState(() => {
    if (isMC) return props.existingSelectedIds.length === 0;
    if (isImage) return props.existingImageCount === 0;
    return !props.existingAnswer;
  });

  const canSubmit = isMC
    ? selectedIds.length > 0
    : isImage
      ? imagePicker.selectedFiles.length > 0
      : text.trim() !== "";

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
              <span
                className={`min-w-0 wrap-anywhere ${saved.includes(opt.id) ? "font-medium" : ""}`}
              >
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // The box is controlled now, so re-entering edit mode must reseed
            // it from the saved answer, or it would still hold whatever was
            // typed before a prior Cancel.
            setText(props.existingAnswer);
            setIsEditing(true);
          }}
        >
          Edit Answer
        </Button>
      </div>
    );
  }

  // ── Editing form ─────────────────────────────────────────────────────────
  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={submitWithoutReset(formAction)}
    >
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="questionId" value={questionId} />
      <ExpectedSchoolField schoolId={schoolId} />

      {isMC ? (
        <McAnswerControls
          questionId={questionId}
          type={questionType}
          options={props.options}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
        />
      ) : isImage ? (
        <ImageAnswerControl
          questionId={questionId}
          photos={imagePicker.selectedFiles.map((selected) => ({
            id: selected.id,
            name: selected.file.name,
          }))}
          error={imagePicker.validationError}
          onAddFiles={imageActions.addFiles}
          onRemoveFile={imageActions.removeFile}
        />
      ) : (
        <FreeTextAnswerControl value={text} onChange={setText} />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || !canSubmit}>
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
            onClick={() => {
              // The read-only MC view renders from this same state, so
              // Cancel must roll it back to the saved picks — otherwise it
              // would show the unsaved edit instead.
              if (isMC) setSelectedIds(props.existingSelectedIds);
              setIsEditing(false);
            }}
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
