"use client";

import { useRef } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import type { EditableFields } from "./import-ai-draft";
import { picturesOf, useImportAi } from "./import-ai-form.state";
import { pictureReferenceHint } from "./picture-references";
import {
  MIN_CHOICES,
  useQuestionEditActions,
  useQuestionEditState,
} from "./question-edit.state";

/**
 * Editable fields for one question's in-progress edit buffer. Mirrors
 * `add-question-form.tsx`'s field set (title, content, free-text model answer,
 * explanation, multiple-choice choices + correctness), minus type-switching —
 * a wrong type is corrected by the card's AI retry, not this form.
 */
export function QuestionEditFields({
  questionId,
  onSave,
  onCancel,
}: {
  questionId: string;
  onSave: (draft: EditableFields) => void;
  onCancel: () => void;
}): React.ReactNode {
  const draft = useQuestionEditState();
  // A multiple-choice draft the AI returned without choices starts with none.
  const choices = draft.options ?? [];
  // Locked while a new file is read, since its answer replaces this card; the typed text stays.
  const { isReading, questions, pictures } = useImportAi();
  const question = questions.find((q) => q.id === questionId);
  const pictureNumbers = question
    ? picturesOf(question, pictures).map((picture) => picture.number)
    : [];
  const {
    setTitle,
    setContent,
    setReferenceAnswer,
    setExplanation,
    setOptionText,
    addOption,
    removeOption,
    toggleOptionCorrect,
  } = useQuestionEditActions();

  // Scoped by questionId (matches RetryQuestionDialog's noteId) — isEditing is
  // per-card state and nothing closes other editors, so two open editors must
  // not collide on the same DOM id.
  const titleId = `edit-question-title-${questionId}`;
  const contentId = `edit-question-content-${questionId}`;
  const referenceAnswerId = `edit-question-reference-answer-${questionId}`;
  const explanationId = `edit-question-explanation-${questionId}`;
  const titleHint = pictureReferenceHint(draft.title, pictureNumbers);
  const contentHint = pictureReferenceHint(draft.content, pictureNumbers);
  const addOptionRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={draft.title}
          disabled={isReading}
          aria-describedby={titleHint ? `${titleId}-picture` : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
        <PictureHint id={`${titleId}-picture`} hint={titleHint} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={contentId}>Content</Label>
        <Textarea
          id={contentId}
          value={draft.content}
          disabled={isReading}
          aria-describedby={contentHint ? `${contentId}-picture` : undefined}
          onChange={(e) => setContent(e.target.value)}
        />
        <PictureHint id={`${contentId}-picture`} hint={contentHint} />
      </div>
      {draft.type === "free_text" && (
        <div className="space-y-1">
          <Label htmlFor={referenceAnswerId}>
            Model answer{" "}
            <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={referenceAnswerId}
            value={draft.referenceAnswer ?? ""}
            disabled={isReading}
            onChange={(e) => setReferenceAnswer(e.target.value)}
          />
        </div>
      )}
      {draft.type !== "free_text" && (
        <div className="space-y-2">
          <Label>Options</Label>
          {choices.map((option, idx) => {
            const hintId = `edit-question-option-${questionId}-${idx}-picture`;
            const hint = pictureReferenceHint(option.text, pictureNumbers);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are controlled, so index keys are safe
              <div key={idx} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type={draft.type === "single_select" ? "radio" : "checkbox"}
                    checked={option.isCorrect}
                    disabled={isReading}
                    onChange={() => toggleOptionCorrect(idx)}
                    // An already-checked radio fires no change event, so the click picks it as the only answer.
                    onClick={
                      draft.type === "single_select"
                        ? () => toggleOptionCorrect(idx)
                        : undefined
                    }
                    aria-label={`Mark option ${idx + 1} correct`}
                  />
                  <Input
                    value={option.text}
                    disabled={isReading}
                    onChange={(e) => setOptionText(idx, e.target.value)}
                    aria-label={`Option ${idx + 1} text`}
                    aria-describedby={hint ? hintId : undefined}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isReading || choices.length <= MIN_CHOICES}
                    aria-label={`Remove choice ${idx + 1}`}
                    onClick={() => {
                      removeOption(idx);
                      // The clicked Remove is disabled or gone afterwards, which would drop keyboard focus.
                      addOptionRef.current?.focus();
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <PictureHint id={hintId} hint={hint} />
              </div>
            );
          })}
          <Button
            ref={addOptionRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={isReading}
            onClick={addOption}
          >
            Add option
          </Button>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={explanationId}>
          Explanation{" "}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={explanationId}
          value={draft.explanation ?? ""}
          disabled={isReading}
          onChange={(e) => setExplanation(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isReading}
          onClick={() => onSave(draft)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * Says which picture a marker-only field names, since the field shows the raw marker.
 * @param id - The note's id, for the field's aria-describedby.
 * @param hint - The note, or null to show nothing.
 */
function PictureHint({
  id,
  hint,
}: {
  id: string;
  hint: string | null;
}): React.ReactNode {
  if (!hint) return null;
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {hint}
    </p>
  );
}
