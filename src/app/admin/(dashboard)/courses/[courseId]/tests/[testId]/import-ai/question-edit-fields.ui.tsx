"use client";

import { useRef } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import type { EditableFields } from "./import-ai-form.state";
import { useImportAi } from "./import-ai-form.state";
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
  const { isReading } = useImportAi();
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
  const addOptionRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={draft.title}
          disabled={isReading}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={contentId}>Content</Label>
        <Textarea
          id={contentId}
          value={draft.content}
          disabled={isReading}
          onChange={(e) => setContent(e.target.value)}
        />
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
          {choices.map((option, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are controlled, so index keys are safe
            <div key={idx} className="flex items-center gap-2">
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
          ))}
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
