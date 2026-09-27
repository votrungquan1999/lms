"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { Textarea } from "src/components/ui/textarea";
import { QUESTION_TYPE_LABELS } from "src/lib/question-labels";
import type { ImportMode } from "./actions";
import type { ImportQuestionDraft } from "./import-ai-form.state";
import { useImportAi } from "./import-ai-form.state";
import {
  QuestionEditProvider,
  useQuestionEditActions,
  useQuestionEditState,
} from "./question-edit.state";

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
 * Renders the reviewable list of questions parsed from the uploaded document,
 * plus the controls that actually write them onto the test (Steps 33-34).
 * `existingQuestionCount`/`answeredStudentCount` describe the test's CURRENT
 * questions (fetched server-side) — what REPLACE would remove, not the
 * reviewed list above.
 */
export function QuestionPreviewList({
  testId,
  courseId,
  existingQuestionCount,
  answeredStudentCount,
}: {
  testId: string;
  courseId: string;
  existingQuestionCount: number;
  answeredStudentCount: number;
}): React.ReactNode {
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
      <ImportModeSelector />
      <ImportQuestionsButton
        testId={testId}
        courseId={courseId}
        existingQuestionCount={existingQuestionCount}
        answeredStudentCount={answeredStudentCount}
      />
    </div>
  );
}

/** D37: lets the teacher choose APPEND (default) or REPLACE before importing. */
function ImportModeSelector(): React.ReactNode {
  const { mode, setMode } = useImportAi();

  return (
    <div className="space-y-1">
      <Label>When importing</Label>
      <RadioGroup
        value={mode}
        onValueChange={(value) => setMode(value as ImportMode)}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="append" id="import-mode-append" />
          <Label htmlFor="import-mode-append">
            Add to the test's existing questions
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="replace" id="import-mode-replace" />
          <Label htmlFor="import-mode-replace">
            Replace the test's existing questions
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

/**
 * Writes the reviewed list onto the test and returns the teacher to the
 * test's admin page on success. In REPLACE mode, clicking opens
 * `ReplaceConfirmDialog` (D45) instead of writing immediately.
 * `importAiQuestionsAction`'s per-question rejection (Step 18) surfaces on
 * the offending `QuestionCard` via `question.importError` — not shown here
 * as a second, bare banner.
 */
function ImportQuestionsButton({
  testId,
  courseId,
  existingQuestionCount,
  answeredStudentCount,
}: {
  testId: string;
  courseId: string;
  existingQuestionCount: number;
  answeredStudentCount: number;
}): React.ReactNode {
  const { mode, importQuestions, isBusy, importFailureMessage } = useImportAi();
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  async function runImport(): Promise<void> {
    const success = await importQuestions(testId, courseId);
    if (success) {
      router.push(`/admin/courses/${courseId}/tests/${testId}`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={isBusy}
        onClick={() =>
          mode === "replace" ? setIsConfirmOpen(true) : runImport()
        }
      >
        {isBusy
          ? "Importing…"
          : mode === "replace"
            ? "Replace questions"
            : "Import questions"}
      </Button>
      {importFailureMessage && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {importFailureMessage}
        </div>
      )}
      <ReplaceConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        existingQuestionCount={existingQuestionCount}
        answeredStudentCount={answeredStudentCount}
        isPending={isBusy}
        onConfirm={async () => {
          // Closes only after the import resolves — see the dialog's own
          // preventDefault note for why closing early made isPending dead.
          await runImport();
          setIsConfirmOpen(false);
        }}
      />
    </div>
  );
}

/**
 * D45's REPLACE confirmation: names what will be stranded, suggests a
 * separate test instead, and requires TYPING "override" — a click alone is
 * not enough, the friction is the point. D33/D43: when the test's current
 * questions have already been answered, the wording states the CORRECTED
 * consequence — an explicitly-submitted student stays Graded; only a
 * student who reached Submitted implicitly (by answering every question)
 * MAY show as In Progress again (orphaned answers still count toward
 * `totalQuestions`, so a shorter replacement list can still leave them at
 * Submitted) — and `getAverageScore` reads every ungraded live question as
 * 0, so their score reads 0% until the new questions are graded.
 * `AlertDialogAction` auto-closes on click (it wraps Radix's `Dialog.Close`),
 * so `handleConfirm` below calls `preventDefault()` before awaiting the
 * import — without it the dialog closes before `isPending` ever renders.
 */
function ReplaceConfirmDialog({
  open,
  onOpenChange,
  existingQuestionCount,
  answeredStudentCount,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingQuestionCount: number;
  answeredStudentCount: number;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}): React.ReactNode {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim().toLowerCase() === "override";

  async function handleConfirm(
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> {
    event.preventDefault();
    await onConfirm();
    setConfirmText("");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setConfirmText("");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Replace this test&rsquo;s questions?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {existingQuestionCount > 0 && (
                <p>
                  This permanently removes the {existingQuestionCount} question
                  {existingQuestionCount === 1 ? "" : "s"} currently on this
                  test before adding the reviewed ones. Consider creating a
                  separate test instead so existing scores are not lost.
                </p>
              )}
              {answeredStudentCount > 0 && (
                <p>
                  At least {answeredStudentCount} student
                  {answeredStudentCount === 1 ? " has" : "s have"} already
                  answered questions on this test. Removing those questions
                  strands their answers — the change log keeps only the removed
                  question&rsquo;s own content and how many students answered
                  it, not what any student actually submitted — and changes
                  affected students&rsquo; overall scores: their scores will
                  read 0% until the new questions are answered and graded. A
                  student who reached Submitted only by answering every question
                  may show as In Progress again; a student who explicitly
                  submitted the test stays Graded.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Label htmlFor="replace-confirm-text">
            Type &ldquo;override&rdquo; to confirm
          </Label>
          <Input
            id="replace-confirm-text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || isPending}
            onClick={handleConfirm}
          >
            {isPending ? "Replacing…" : "Yes, replace"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
                // A manual save is what "hand-edited" (D40) means. Empty
                // optional fields become `undefined`, not "" — a cleared
                // model answer must stay retryable and importable, and the
                // controlled textarea (which needs "" to be clearable) never
                // sees this normalization.
                updateQuestion(question.id, {
                  ...draft,
                  referenceAnswer: draft.referenceAnswer || undefined,
                  explanation: draft.explanation || undefined,
                  edited: true,
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
            <Badge variant="outline">
              {QUESTION_TYPE_LABELS[question.type]}
            </Badge>
            <RetryQuestionDialog question={question} />
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
        {question.retryError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {question.retryError}
          </div>
        )}
        {question.importError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {question.importError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Per-question "Retry with AI" trigger + Dialog. Sends the correction note
 * plus the current draft and the full document text; only this question's
 * card is affected. D40: if the draft has been hand-edited since its last AI
 * result, retrying requires an explicit second confirmation before it
 * discards that edit.
 */
function RetryQuestionDialog({
  question,
}: {
  question: ImportQuestionDraft;
}): React.ReactNode {
  const { retryOneQuestion } = useImportAi();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirmedDiscard, setConfirmedDiscard] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const needsDiscardConfirmation = question.edited && !confirmedDiscard;
  const noteId = `retry-question-note-${question.id}`;

  async function handleRetry(): Promise<void> {
    setIsPending(true);
    await retryOneQuestion(question.id, note);
    setIsPending(false);
    setOpen(false);
    setNote("");
    setConfirmedDiscard(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmedDiscard(false);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Retry with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask the AI to read this question again</DialogTitle>
          <DialogDescription>
            Explain what was wrong. Only this question changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor={noteId}>What was wrong?</Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {needsDiscardConfirmation ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              This question has been hand-edited. Retrying will discard those
              changes.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmedDiscard(true)}
            >
              Discard my edit and retry anyway
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={isPending || note.trim().length === 0}
            onClick={handleRetry}
          >
            {isPending ? "Retrying…" : "Retry"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
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
