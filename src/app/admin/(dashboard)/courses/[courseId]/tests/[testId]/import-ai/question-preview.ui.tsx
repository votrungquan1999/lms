"use client";

import { useState } from "react";
import { Badge } from "src/components/ui/badge";
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
import type { ImportQuestionDraft } from "./import-ai-form.state";
import { useImportAi } from "./import-ai-form.state";
import {
  QuestionEditProvider,
  useQuestionEditActions,
  useQuestionEditState,
} from "./question-edit.state";

/** Human-readable label for each question type the AI can identify. */
const TYPE_LABELS: Record<string, string> = {
  free_text: "Free response",
  single_select: "Multiple choice (one answer)",
  multi_select: "Multiple choice (multiple answers)",
};

/**
 * File picker for the document to import; shows an error if unusable.
 */
export function ImportAiFilePicker(): React.ReactNode {
  const { selectFile, error, isBusy } = useImportAi();

  return (
    <div className="space-y-3">
      <Label htmlFor="import-ai-file">Document (.docx or .pdf)</Label>
      <Input
        id="import-ai-file"
        type="file"
        accept=".docx,.pdf"
        disabled={isBusy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) selectFile(file);
        }}
      />
      {error && (
        <div
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the reviewable list of questions parsed from the uploaded document.
 */
export function QuestionPreviewList(): React.ReactNode {
  const { questions } = useImportAi();

  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">
        {questions.length} question{questions.length === 1 ? "" : "s"} found
      </h2>
      {questions.map((question, index) => (
        <QuestionCard key={question.id} question={question} index={index} />
      ))}
    </div>
  );
}

/**
 * One reviewable question: its read-only card, or — while a teacher is
 * correcting it — its edit form. Editing is scoped to this one card; the
 * rest of the list is untouched until Save writes back by this question's id.
 */
function QuestionCard({
  question,
  index,
}: {
  question: ImportQuestionDraft;
  index: number;
}): React.ReactNode {
  const { updateQuestion } = useImportAi();
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <QuestionEditProvider initial={question}>
            <QuestionEditFields
              questionId={question.id}
              onSave={(draft) => {
                // Empty optional fields become `undefined`, not "" — a
                // cleared model answer must stay retryable and importable,
                // and the controlled textarea (which needs "" to be
                // clearable) never sees this normalization.
                updateQuestion(question.id, {
                  ...draft,
                  referenceAnswer: draft.referenceAnswer || undefined,
                  explanation: draft.explanation || undefined,
                });
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          </QuestionEditProvider>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">#{index + 1}</span>
            <span>{question.title}</span>
          </span>
          <span className="flex items-center gap-2">
            <Badge variant="outline">{TYPE_LABELS[question.type]}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{question.content}</p>
        {question.options && (
          <ul className="space-y-1 text-sm">
            {question.options.map((option) => (
              <li key={option.text} className="flex items-center gap-2">
                <span>{option.isCorrect ? "✓" : "○"}</span>
                <span>{option.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Editable fields for one question's in-progress edit buffer. Mirrors
 * `add-question-form.tsx`'s field set (title, content, free-text model
 * answer/explanation, MC options + correctness), minus type-switching —
 * a wrong type is corrected via Step 16's AI retry, not this form.
 */
function QuestionEditFields({
  questionId,
  onSave,
  onCancel,
}: {
  questionId: string;
  onSave: (draft: Omit<ImportQuestionDraft, "id">) => void;
  onCancel: () => void;
}): React.ReactNode {
  const draft = useQuestionEditState();
  const {
    setTitle,
    setContent,
    setReferenceAnswer,
    setExplanation,
    setOptionText,
    toggleOptionCorrect,
  } = useQuestionEditActions();

  // Scoped by questionId (matches RetryQuestionDialog's noteId) — isEditing is
  // per-card state and nothing closes other editors, so two open editors must
  // not collide on the same DOM id.
  const titleId = `edit-question-title-${questionId}`;
  const contentId = `edit-question-content-${questionId}`;
  const referenceAnswerId = `edit-question-reference-answer-${questionId}`;
  const explanationId = `edit-question-explanation-${questionId}`;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={draft.title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={contentId}>Content</Label>
        <Textarea
          id={contentId}
          value={draft.content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      {draft.type === "free_text" && (
        <>
          <div className="space-y-1">
            <Label htmlFor={referenceAnswerId}>
              Model answer{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={referenceAnswerId}
              value={draft.referenceAnswer ?? ""}
              onChange={(e) => setReferenceAnswer(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={explanationId}>
              Explanation{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={explanationId}
              value={draft.explanation ?? ""}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>
        </>
      )}
      {draft.options && (
        <div className="space-y-2">
          <Label>Options</Label>
          {draft.options.map((option, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: option order is stable within one edit session
            <div key={idx} className="flex items-center gap-2">
              <input
                type={draft.type === "single_select" ? "radio" : "checkbox"}
                checked={option.isCorrect}
                onChange={() => toggleOptionCorrect(idx)}
                aria-label={`Mark option ${idx + 1} correct`}
              />
              <Input
                value={option.text}
                onChange={(e) => setOptionText(idx, e.target.value)}
                aria-label={`Option ${idx + 1} text`}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}
