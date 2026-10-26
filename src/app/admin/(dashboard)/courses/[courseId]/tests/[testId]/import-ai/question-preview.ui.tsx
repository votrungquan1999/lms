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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { Textarea } from "src/components/ui/textarea";
import { QUESTION_TYPE_LABELS } from "src/lib/question-labels";
import type { MediaContentType } from "src/lib/question-service";
import { MAX_MEDIA_PER_QUESTION } from "../question-media.schema";
import type { ImportMode } from "./actions";
import type {
  Change,
  EditableFields,
  ImportQuestionDraft,
  ReviewPicture,
} from "./import-ai-form.state";
import {
  checkDocumentFile,
  editableFieldsOf,
  picturesOf,
  useImportAi,
} from "./import-ai-form.state";
import {
  MIN_CHOICES,
  QuestionEditProvider,
  useQuestionEditActions,
  useQuestionEditState,
} from "./question-edit.state";
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
 * Words an Undo or Redo button so it names the change and the question it touches.
 * @param verb - "Undo" or "Redo".
 * @param change - The change the button would act on, if any.
 * @param drafts - The drafts just before the change applies, so a deleted question still has its position.
 * @param firstQuestionNumber - Number the first draft will have once saved.
 * @returns The bare verb when there is nothing to act on.
 */
function historyLabel(
  verb: "Undo" | "Redo",
  change: Change | null,
  drafts: ImportQuestionDraft[],
  firstQuestionNumber: number,
): string {
  if (!change) return verb;
  const position = drafts.findIndex((draft) => draft.id === change.id);
  const question = `Question ${firstQuestionNumber + position}`;
  switch (change.kind) {
    case "edit":
      return `${verb} edit of ${question}`;
    case "removePicture":
      return `${verb} removing picture ${change.number} from ${question}`;
    case "addPicture":
      return `${verb} adding picture ${change.number} to ${question}`;
    case "retry":
      return `${verb} AI retry of ${question}`;
    case "delete":
      return `${verb} delete of ${question}`;
    case "movePicture": {
      const toPosition = drafts.findIndex((draft) => draft.id === change.toId);
      return `${verb} move of picture ${change.number} from ${question} to Question ${firstQuestionNumber + toPosition}`;
    }
  }
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
  return drafts.map((draft, index) => ({
    id: draft.id,
    order: firstQuestionNumber + index,
    title: draft.title,
    content: draft.content,
    type: draft.type,
    options: (draft.options ?? []).map((option, optionIndex) => ({
      id: `${draft.id}-opt-${optionIndex}`,
      text: option.text,
      isCorrect: false,
    })),
    media: picturesOf(draft, pictures).map((picture, order) => ({
      key: `draft-picture-${picture.number}`,
      url: picture.previewUrl,
      // Document pictures are only png/jpeg/webp (see document-extract).
      contentType: picture.file.type as MediaContentType,
      order,
    })),
  }));
}

/** D37: lets the teacher choose APPEND (default) or REPLACE before importing. */
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
 * The REPLACE confirmation: says what the import deletes and adds, what
 * happens to students who already answered, and — only when some have —
 * that a new test keeps existing scores. The teacher must TYPE "override" —
 * a click alone is not enough, the friction is the point.
 * `AlertDialogAction` auto-closes on click (it wraps Radix's `Dialog.Close`),
 * so `handleConfirm` below calls `preventDefault()` before awaiting the
 * import — without it the dialog closes before `isPending` ever renders.
 */
function ReplaceConfirmDialog({
  open,
  onOpenChange,
  existingQuestionCount,
  reviewedCount,
  answeredStudentCount,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingQuestionCount: number;
  /** How many reviewed questions the import adds. */
  reviewedCount: number;
  answeredStudentCount: number;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}): React.ReactNode {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim().toLowerCase() === "override";
  const reviewedPhrase = `${reviewedCount} reviewed question${reviewedCount === 1 ? "" : "s"}`;

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
              <p>
                {existingQuestionCount > 0
                  ? `This deletes the test's ${existingQuestionCount} question${existingQuestionCount === 1 ? "" : "s"} and adds the ${reviewedPhrase}.`
                  : `This adds the ${reviewedPhrase}.`}
              </p>
              {answeredStudentCount > 0 && (
                <p>
                  At least {answeredStudentCount} student
                  {answeredStudentCount === 1 ? "" : "s"} already answered:
                  their answers to the old questions won&rsquo;t count, their
                  scores show 0% until the new questions are graded, and some
                  may show as In Progress again. To keep existing scores, create
                  a new test instead.
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

  return (
    <Card id={cardDomId(question.id)} tabIndex={-1}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {/* min-w-0 + wrap-anywhere let an unbroken title shrink, keeping the buttons in view. */}
          <span className="flex min-w-0 items-center gap-1">
            <span className="text-muted-foreground">#{number}</span>
            <span className="min-w-0 wrap-anywhere">{question.title}</span>
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
        <MarkdownContent content={question.content} compact />
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
        {question.options && (
          <ul className="space-y-1 text-sm">
            {question.options.map((option, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: choice texts can repeat or be blank, and the list is read-only
              <li key={idx} className="flex items-center gap-2">
                <span>{option.isCorrect ? "✓" : "○"}</span>
                <span className="min-w-0 wrap-anywhere">{option.text}</span>
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

/**
 * The document pictures the AI matched to one question, so the teacher can
 * check them before import and remove a wrong one. A number with no picture
 * behind it is skipped.
 */
function QuestionPictures({
  question,
  firstQuestionNumber,
}: {
  question: ImportQuestionDraft;
  firstQuestionNumber: number;
}): React.ReactNode {
  const { pictures, questions, removePicture, movePicture, isBusy } =
    useImportAi();
  const shown = picturesOf(question, pictures);
  if (shown.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {shown.map((picture) => {
        const targets = moveTargets(question, picture, questions, pictures);
        return (
          <div key={picture.number} className="grid gap-1">
            {/* A local blob preview — next/image can't optimize it. */}
            {/* biome-ignore lint/performance/noImgElement: local blob preview url */}
            <img
              src={picture.previewUrl}
              alt={`Figure ${picture.number}`}
              className="max-h-48 w-full rounded-md border border-border object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label={`Remove picture ${picture.number}`}
              disabled={isBusy}
              onClick={() => removePicture(question.id, picture.number)}
            >
              Remove
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Move picture ${picture.number} to another question`}
                  disabled={isBusy || targets.every((t) => t.unavailable)}
                >
                  Move to question…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-auto max-w-xs min-w-48">
                {targets.map(({ target, index, unavailable }) => (
                  <DropdownMenuItem
                    key={target.id}
                    disabled={unavailable !== null}
                    onSelect={() =>
                      movePicture(picture.number, question.id, target.id)
                    }
                  >
                    #{firstQuestionNumber + index}
                    {target.title.trim() && ` ${target.title.trim()}`}
                    {unavailable && ` — ${unavailable}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Every question except the picture's own, with why it cannot take the picture if it cannot.
 * @param owner - The question the picture is on.
 * @param picture - The picture to move.
 * @param drafts - The drafts as listed now.
 * @param pictures - Every picture the document had.
 * @returns One entry per other question, with its position in the list.
 */
function moveTargets(
  owner: ImportQuestionDraft,
  picture: ReviewPicture,
  drafts: ImportQuestionDraft[],
  pictures: ReviewPicture[],
): {
  target: ImportQuestionDraft;
  index: number;
  unavailable: string | null;
}[] {
  return drafts.flatMap((target, index) => {
    if (target.id === owner.id) return [];
    // Counts the pictures the card shows, as the Unused area does.
    const unavailable = target.imageNumbers?.includes(picture.number)
      ? "already has this picture"
      : picturesOf(target, pictures).length >= MAX_MEDIA_PER_QUESTION
        ? "full"
        : null;
    return [{ target, index, unavailable }];
  });
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
  const { retryOneQuestion, cancelRetry, isBusy, retryingIds } = useImportAi();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirmedDiscard, setConfirmedDiscard] = useState(false);
  // Counts this dialog's retries, so a cancelled one cannot close a later dialog.
  const attempt = useRef(0);
  const isPending = retryingIds.includes(question.id);

  const needsDiscardConfirmation = question.edited && !confirmedDiscard;
  const noteId = `retry-question-note-${question.id}`;

  async function handleRetry(): Promise<void> {
    attempt.current += 1;
    const mine = attempt.current;
    await retryOneQuestion(question.id, note);
    if (attempt.current !== mine) return;
    setOpen(false);
    setNote("");
    setConfirmedDiscard(false);
  }

  function handleCancel(): void {
    attempt.current += 1;
    cancelRetry(question.id);
    setOpen(false);
    setNote("");
    setConfirmedDiscard(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing a dialog with a retry running gives that retry up.
        if (!next && isPending) {
          handleCancel();
          return;
        }
        setOpen(next);
        if (!next) setConfirmedDiscard(false);
      }}
    >
      <DialogTrigger asChild>
        {/* Locked while a read or import runs: an import uploads this draft's pictures, and a retry can change them. */}
        <Button type="button" variant="secondary" size="sm" disabled={isBusy}>
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
        {isPending && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
          >
            Cancel retry
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Editable fields for one question's in-progress edit buffer. Mirrors
 * `add-question-form.tsx`'s field set (title, content, free-text model answer,
 * explanation, multiple-choice choices + correctness), minus type-switching —
 * a wrong type is corrected by the card's AI retry, not this form.
 */
function QuestionEditFields({
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
