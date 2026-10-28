"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { MarkdownContent } from "src/components/markdown-content";
import type { StudentCardQuestion } from "src/components/student-question-card.ui";
import { StudentViewList } from "src/components/student-view-list.ui";
import {
  type QuestionListView,
  StudentViewToggle,
} from "src/components/student-view-toggle";
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
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { QUESTION_TYPE_LABELS } from "src/lib/question-labels";
import type { MediaContentType } from "src/lib/question-service";
import { MAX_MEDIA_PER_QUESTION } from "../question-media.schema";
import type { ImportMode } from "./actions";
import type {
  ImportQuestionDraft,
  ReviewPicture,
} from "./import-ai-form.state";
import {
  checkDocumentFile,
  editableFieldsOf,
  picturesOf,
  useImportAi,
} from "./import-ai-form.state";
import { historyLabel } from "./import-ai-history";
import {
  missingPictureReference,
  pictureReferenceText,
} from "./picture-references";
import { QuestionEditProvider } from "./question-edit.state";
import { QuestionEditFields } from "./question-edit-fields.ui";
import { QuestionPictures } from "./question-pictures.ui";
import { ReplaceConfirmDialog } from "./replace-confirm-dialog.ui";
import { RetryQuestionDialog } from "./retry-question-dialog.ui";
import { UnusedPictures } from "./unused-pictures.ui";

/** Input types that take typed text, where the browser's own undo must keep working. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
]);

/** Open dialogs and menus, which take the keyboard from the page behind them. */
const OVERLAY_SELECTOR = '[role="dialog"],[role="alertdialog"],[role="menu"]';

/**
 * Whether a key press landed in a field with its own typing undo.
 * @param target - The element that received the key press.
 * @returns True for text inputs, textareas, selects and contenteditable elements.
 */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable]")) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type);
  }
  return (
    target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}

/**
 * The DOM id of a question's card, so focus can return to it.
 * @param questionId - The draft's id.
 * @returns The element id.
 */
function cardDomId(questionId: string): string {
  return `import-ai-card-${questionId}`;
}

/**
 * File picker for the document to import; shows an error if unusable.
 */
export function ImportAiFilePicker(): React.ReactNode {
  const {
    selectFile,
    error,
    isBusy,
    isReading,
    readingFileName,
    lastReadFileName,
    questions,
    hasWorkOnScreen,
  } = useImportAi();
  // The picked file waiting for the teacher to agree to replace the list.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The input is cleared on every pick, so the name is shown from state.
  const shownFileName = isReading ? readingFileName : lastReadFileName;

  return (
    <div className="space-y-3">
      <Label htmlFor="import-ai-file">Document (.docx or .pdf)</Label>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
        <span className="text-sm text-muted-foreground">
          {shownFileName ?? "No file chosen"}
        </span>
      </div>
      <Input
        ref={inputRef}
        id="import-ai-file"
        type="file"
        accept=".docx,.pdf"
        // Visually hidden but focusable; the Choose file button opens it.
        className="sr-only w-px"
        disabled={isBusy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again still fires onChange.
          event.target.value = "";
          if (!file) return;
          // A wrong type or oversized file is reported at once; any other file needs the confirm.
          if (hasWorkOnScreen && checkDocumentFile(file) === null) {
            setPendingFile(file);
            return;
          }
          selectFile(file);
        }}
      />
      <AlertDialog
        open={pendingFile !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replace the questions on screen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Reading {pendingFile?.name} takes about a minute. Once it is read,
              it replaces the questions you have on screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingFile) selectFile(pendingFile);
                setPendingFile(null);
              }}
            >
              Read and replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isReading && (
        <output className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Reading {readingFileName}…
          {questions.length > 0 &&
            " The list below is from your previous file."}
        </output>
      )}
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
 * plus the controls that actually write them onto the test.
 * `existingQuestionCount`/`answeredStudentCount` describe the test's CURRENT
 * questions (fetched server-side) — what REPLACE would remove, not the
 * reviewed list above.
 */
export function QuestionPreviewList({
  testId,
  courseId,
  existingQuestionCount,
  answeredStudentCount,
  highestExistingQuestionNumber = 0,
}: {
  testId: string;
  courseId: string;
  existingQuestionCount: number;
  answeredStudentCount: number;
  /** Number of the test's last live question (0 when none); Student view continues after it. */
  highestExistingQuestionNumber?: number;
}): React.ReactNode {
  const { readId } = useImportAi();

  if (!readId) {
    return null;
  }

  return (
    // A new file remounts the screen back on Teacher view; deleting questions does not.
    <ReviewScreen
      key={readId}
      testId={testId}
      courseId={courseId}
      existingQuestionCount={existingQuestionCount}
      answeredStudentCount={answeredStudentCount}
      highestExistingQuestionNumber={highestExistingQuestionNumber}
    />
  );
}

/** The review list, its Teacher/Student view switch, and the import controls. */
function ReviewScreen({
  testId,
  courseId,
  existingQuestionCount,
  answeredStudentCount,
  highestExistingQuestionNumber,
}: {
  testId: string;
  courseId: string;
  existingQuestionCount: number;
  answeredStudentCount: number;
  highestExistingQuestionNumber: number;
}): React.ReactNode {
  const {
    questions,
    pictures,
    mode,
    isReading,
    isBusy,
    questionsAfterUndo,
    undoChange,
    redoChange,
    undo,
    redo,
    removeQuestion,
  } = useImportAi();
  // The server numbers new questions after the highest live one, not the
  // count; replacing removes them all first, so numbering restarts at 1.
  const firstQuestionNumber =
    mode === "replace" ? 1 : highestExistingQuestionNumber + 1;
  const [view, setView] = useState<QuestionListView>("teacher");
  const undoButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once the list has re-rendered after a delete or the Undo of one.
  const pendingFocus = useRef<"undo" | { cardId: string } | null>(null);

  /** Undoes the latest change, sending focus to the question when it was a delete. */
  function undoWithFocus(): void {
    if (undoChange?.kind === "delete") {
      pendingFocus.current = { cardId: undoChange.id };
    }
    undo();
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "z") {
      return;
    }
    // AltGr layouts report Ctrl+Alt; a held key must not undo step after step.
    if (event.altKey || event.repeat) return;
    if (isTextEntry(event.target)) return;
    // The overlay owns the keyboard while it is open.
    if (document.querySelector(OVERLAY_SELECTOR)) return;
    const change = event.shiftKey ? redoChange : undoChange;
    if (!change || isBusy) return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undoWithFocus();
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: an Effect Event is never a dependency
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Runs after every render so focus lands once the list has changed.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "undo") undoButton.current?.focus();
    else if (target) document.getElementById(cardDomId(target.cardId))?.focus();
  });

  return (
    <div className="space-y-3">
      {questions.length === 0 ? (
        <h2 className="text-lg font-semibold">
          All questions deleted. Undo to bring them back.
        </h2>
      ) : (
        <h2 className="text-lg font-semibold">
          {questions.length} question{questions.length === 1 ? "" : "s"} found
        </h2>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!undoChange || isBusy}
          ref={undoButton}
          onClick={undoWithFocus}
        >
          {historyLabel(
            "Undo",
            undoChange,
            questionsAfterUndo,
            firstQuestionNumber,
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!redoChange || isBusy}
          onClick={redo}
        >
          {historyLabel("Redo", redoChange, questions, firstQuestionNumber)}
        </Button>
      </div>
      <StudentViewToggle
        view={view}
        onViewChange={setView}
        teacherView={
          // Dimmed while a new file is read, since its answer replaces this list.
          <div
            aria-busy={isReading}
            className={isReading ? "space-y-3 opacity-50" : "space-y-3"}
          >
            <UnusedPictures firstQuestionNumber={firstQuestionNumber} />
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                number={firstQuestionNumber + index}
                firstQuestionNumber={firstQuestionNumber}
                onDelete={() => {
                  pendingFocus.current = "undo";
                  removeQuestion(question.id);
                }}
              />
            ))}
          </div>
        }
        studentView={
          <div
            aria-busy={isReading}
            className={isReading ? "opacity-50" : undefined}
          >
            <StudentViewList
              questions={toStudentCards(
                questions,
                pictures,
                firstQuestionNumber,
              )}
            />
          </div>
        }
      />
      <ImportModeSelector />
      <ImportQuestionsButton
        testId={testId}
        courseId={courseId}
        existingQuestionCount={existingQuestionCount}
        answeredStudentCount={answeredStudentCount}
        showQuestionRejection={view === "student"}
        firstQuestionNumber={firstQuestionNumber}
      />
    </div>
  );
}

/**
 * Turns the reviewed drafts into student cards. The answer key (correct
 * marks, model answer, explanation) is left out on purpose.
 * @param drafts - The reviewed drafts, in review order.
 * @param pictures - The document's pictures, to attach to the drafts that use them.
 * @param firstQuestionNumber - Number the first draft will have once saved.
 * @returns One card per draft, numbered in review order.
 */
function toStudentCards(
  drafts: ImportQuestionDraft[],
  pictures: ReviewPicture[],
  firstQuestionNumber: number,
): StudentCardQuestion[] {
  return drafts.map((draft, index) => {
    const shown = picturesOf(draft, pictures);
    const pictureNumbers = shown.map((picture) => picture.number);
    return {
      id: draft.id,
      order: firstQuestionNumber + index,
      title: pictureReferenceText(draft.title, pictureNumbers),
      content: pictureReferenceText(draft.content, pictureNumbers),
      type: draft.type,
      options: (draft.options ?? []).map((option, optionIndex) => ({
        id: `${draft.id}-opt-${optionIndex}`,
        text: pictureReferenceText(option.text, pictureNumbers),
      })),
      media: shown.map((picture, order) => ({
        key: `draft-picture-${picture.number}`,
        url: picture.previewUrl,
        // Document pictures are only png/jpeg/webp (see document-extract).
        contentType: picture.file.type as MediaContentType,
        order,
      })),
    };
  });
}

/** Lets the teacher choose APPEND (default) or REPLACE before importing. */
function ImportModeSelector(): React.ReactNode {
  const { mode, setMode, isBusy } = useImportAi();

  return (
    <div className="space-y-1">
      <Label>When importing</Label>
      <RadioGroup
        value={mode}
        disabled={isBusy}
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
 * `ReplaceConfirmDialog` instead of writing immediately.
 * `importAiQuestionsAction`'s per-question rejection surfaces on
 * the offending `QuestionCard` via `question.importError`; here it shows only
 * in Student view, where that card is hidden.
 */
function ImportQuestionsButton({
  testId,
  courseId,
  existingQuestionCount,
  answeredStudentCount,
  showQuestionRejection,
  firstQuestionNumber,
}: {
  testId: string;
  courseId: string;
  existingQuestionCount: number;
  answeredStudentCount: number;
  /** True while the question's own card is hidden, so its rejection needs showing here. */
  showQuestionRejection: boolean;
  /** Number the first draft will have once saved, so the reason can lead with the card's own label. */
  firstQuestionNumber: number;
}): React.ReactNode {
  const {
    mode,
    importQuestions,
    isBusy,
    isImporting,
    importFailureMessage,
    questions,
    retryingIds,
    openEditIds,
  } = useImportAi();
  // A running retry can still change a draft, so Import waits for it.
  const isRetrying = retryingIds.length > 0;
  // An unsaved edit would be left out of the import.
  const hasOpenEdits = openEditIds.length > 0;
  const rejectedIndex = questions.findIndex((question) => question.importError);
  const rejected = questions[rejectedIndex];
  // Student view leads with the card's own label; the server's review-position prefix would disagree in add mode.
  const questionRejection =
    showQuestionRejection && rejected
      ? `Question ${firstQuestionNumber + rejectedIndex}${rejected.title?.trim() ? `: ${rejected.title.trim()}` : ""} — ${rejected.importReason ?? rejected.importError}`
      : null;
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Leaving mid-import lets it finish; the page is gone, so it must not redirect.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function runImport(): Promise<void> {
    const success = await importQuestions(testId, courseId);
    if (success && isMounted.current) {
      router.push(`/admin/courses/${courseId}/tests/${testId}`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={
          isBusy || isRetrying || hasOpenEdits || questions.length === 0
        }
        onClick={() =>
          mode === "replace" ? setIsConfirmOpen(true) : runImport()
        }
      >
        {isImporting
          ? "Importing…"
          : mode === "replace"
            ? "Replace questions"
            : "Import questions"}
      </Button>
      {hasOpenEdits && (
        <p className="text-sm text-muted-foreground">
          Save or cancel your open edits first
        </p>
      )}
      {(importFailureMessage ?? questionRejection) && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {importFailureMessage ?? questionRejection}
        </div>
      )}
      <ReplaceConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        existingQuestionCount={existingQuestionCount}
        reviewedCount={questions.length}
        answeredStudentCount={answeredStudentCount}
        isPending={isImporting}
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
 * One reviewable question: its read-only card, or — while a teacher is
 * correcting it — its edit form. Editing is scoped to this one card; the
 * rest of the list is untouched until Save writes back by this question's id.
 */
function QuestionCard({
  question,
  number,
  firstQuestionNumber,
  onDelete,
}: {
  question: ImportQuestionDraft;
  /** Number the question will have once saved. */
  number: number;
  /** Number the first draft will have once saved, to label the other questions. */
  firstQuestionNumber: number;
  onDelete: () => void;
}): React.ReactNode {
  const { saveEdit, pictures, isBusy, setEditOpen } = useImportAi();
  const [isEditing, setIsEditing] = useState(false);

  // Cleanup also runs when the card goes away mid-edit, so a removed card never blocks Import.
  useEffect(() => {
    if (!isEditing) return;
    setEditOpen(question.id, true);
    return () => setEditOpen(question.id, false);
  }, [isEditing, question.id, setEditOpen]);

  if (isEditing) {
    return (
      <Card id={cardDomId(question.id)} tabIndex={-1}>
        <CardContent className="space-y-3 pt-4">
          <QuestionEditProvider initial={editableFieldsOf(question)}>
            <QuestionEditFields
              questionId={question.id}
              onSave={(draft) => {
                // Blank optional fields become undefined so the draft stays retryable and importable; the textarea still needs "".
                saveEdit(question.id, {
                  ...draft,
                  referenceAnswer: draft.referenceAnswer?.trim()
                    ? draft.referenceAnswer
                    : undefined,
                  explanation: draft.explanation?.trim()
                    ? draft.explanation
                    : undefined,
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

  const warning = answerKeyWarning(question);
  const pictureNumbers = picturesOf(question, pictures).map(
    (picture) => picture.number,
  );
  const missingPicture = missingPictureReference(question, pictureNumbers);

  return (
    <Card id={cardDomId(question.id)} tabIndex={-1}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {/* min-w-0 + wrap-anywhere let an unbroken title shrink, keeping the buttons in view. */}
          <span className="flex min-w-0 items-center gap-1">
            <span className="text-muted-foreground">#{number}</span>
            <span className="min-w-0 wrap-anywhere">
              {pictureReferenceText(question.title, pictureNumbers)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">
              {QUESTION_TYPE_LABELS[question.type]}
            </Badge>
            {warning && <Badge variant="destructive">{warning}</Badge>}
            <RetryQuestionDialog question={question} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Delete question ${number}`}
              disabled={isBusy}
              onClick={onDelete}
            >
              Delete
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <MarkdownContent
          content={pictureReferenceText(question.content, pictureNumbers)}
          compact
        />
        <QuestionPictures
          question={question}
          firstQuestionNumber={firstQuestionNumber}
        />
        {/* Counts the pictures the card shows; Import rejects a question over the limit. */}
        {picturesOf(question, pictures).length > MAX_MEDIA_PER_QUESTION && (
          <p className="text-sm text-destructive">
            A question can have at most {MAX_MEDIA_PER_QUESTION} pictures.
            Remove one to import it.
          </p>
        )}
        {missingPicture && (
          <p className="text-sm text-destructive">
            {missingPicture.label} names a picture this question no longer has.
            Move the picture back or edit the {missingPicture.field} to import
            it.
          </p>
        )}
        {question.options && (
          <ul className="space-y-1 text-sm">
            {question.options.map((option, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: choice texts can repeat or be blank, and the list is read-only
              <li key={idx} className="flex items-center gap-2">
                <span>{option.isCorrect ? "✓" : "○"}</span>
                <span className="min-w-0 wrap-anywhere">
                  {pictureReferenceText(option.text, pictureNumbers)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {question.type === "free_text" && question.referenceAnswer?.trim() && (
          <div className="text-muted-foreground">
            <p className="text-xs font-medium">Model answer</p>
            <MarkdownContent content={question.referenceAnswer} compact />
          </div>
        )}
        {question.explanation?.trim() && (
          <div className="text-muted-foreground">
            <p className="text-xs font-medium">Explanation</p>
            <MarkdownContent content={question.explanation} compact />
          </div>
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
            Question {number} — {question.importReason ?? question.importError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The warning a multiple-choice card shows when its answer key is incomplete,
 * following the saved-test list's rules (`question-list.tsx`); the question can
 * still be imported.
 * @param question - The draft to check.
 */
function answerKeyWarning(question: ImportQuestionDraft): string | null {
  if (question.type === "free_text") return null;
  const options = question.options ?? [];
  // Too few choices wins, since marking an answer cannot fix it.
  if (options.length < 2) return "Needs at least 2 choices";
  if (options.every((option) => !option.isCorrect)) {
    return "No correct answer marked";
  }
  return null;
}
