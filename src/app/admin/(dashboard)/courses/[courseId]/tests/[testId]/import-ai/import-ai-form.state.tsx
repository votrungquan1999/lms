"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { useLeaveGuard } from "src/app/admin/(dashboard)/leave-guard.state";
import { AI_CALL_TIMEOUT_MS } from "src/lib/ai/ai-call-timeout";
import {
  AI_FAILURE_MESSAGES,
  AiFailureCause,
} from "src/lib/ai/ai-failure-messages";
import {
  INVALID_MEDIA_KEY_MESSAGE,
  MAX_MEDIA_PER_QUESTION,
  type SubmittedMedia,
} from "../question-media.schema";
import {
  type ImportMode,
  importAiQuestionsAction,
  parseQuestionsAction,
  type ReviewedQuestion,
  retryQuestionAction,
} from "./actions";
import {
  type DocumentPicture,
  extractDocx,
  extractTextFromPdf,
} from "./document-extract";
import {
  DocumentFileType,
  DocumentReadFailure,
  type DocumentReadFailureReport,
} from "./document-read-failure";
import {
  type EditableFields,
  editableFieldsOf,
  type ImportQuestionDraft,
} from "./import-ai-draft";
import {
  type Change,
  type RetryPatch,
  replay,
  sameFields,
} from "./import-ai-history";
import {
  runInOrder,
  UPLOAD_CONCURRENCY,
  uploadPictures,
} from "./import-ai-uploads";
import {
  missingPictureReference,
  pictureReferenceText,
} from "./picture-references";
import { reportDocumentReadFailureAction } from "./read-failure-actions";

/** A document picture, previewed on the review screen and uploaded on import. */
export interface ReviewPicture {
  number: number;
  file: File;
  previewUrl: string;
}

/**
 * The document pictures one draft uses, in document order. A number with no
 * picture behind it is skipped.
 * @param draft - The draft whose pictures to find.
 * @param pictures - Every picture the document had.
 * @returns The draft's pictures.
 */
export function picturesOf(
  draft: Pick<ImportQuestionDraft, "imageNumbers">,
  pictures: ReviewPicture[],
): ReviewPicture[] {
  return pictures.filter((picture) =>
    draft.imageNumbers?.includes(picture.number),
  );
}

/**
 * A draft's title as its card shows it, so a marker-only title reads "Picture k" wherever the draft is listed.
 * @param draft - The draft to name.
 * @param pictures - Every picture the document had.
 * @returns The title with marker-only text resolved, trimmed.
 */
export function shownTitle(
  draft: Pick<ImportQuestionDraft, "title" | "imageNumbers">,
  pictures: ReviewPicture[],
): string {
  return pictureReferenceText(
    draft.title,
    picturesOf(draft, pictures).map((picture) => picture.number),
  ).trim();
}

/** A picture already in storage; its order depends on the question it is saved with. */
type UploadedPicture = Omit<SubmittedMedia[number], "order">;

/** The pictures uploaded for one read, by `[image N]` number. */
interface UploadedPictures {
  readId: string | null;
  media: Map<number, UploadedPicture>;
}

/** What the screen is waiting on: nothing, the AI reading a file, or the import writing. */
type ImportPhase = "idle" | "reading" | "importing";

interface ImportAiState {
  documentText: string;
  /** Every picture the document had, keyed by its `[image N]` number. */
  pictures: ReviewPicture[];
  /** Identifies the last read, so the review screen resets only when a new file is read. */
  readId: string | null;
  /** The drafts as the last read returned them; `changes` are replayed over them. */
  base: ImportQuestionDraft[];
  changes: Change[];
  /** Changes taken back by Undo, most recently undone last. */
  redo: Change[];
  /** Per draft id: the failure of its last retry. */
  retryErrors: Record<string, string>;
  /** Per draft id: the rejection of the last import attempt. */
  importErrors: Record<string, { message: string; reason: string }>;
  error: string | null;
  phase: ImportPhase;
  /** The file being read, since the file input is cleared on every pick. */
  readingFileName: string | null;
  /** The file whose questions are on screen; kept when a later read fails. */
  lastReadFileName: string | null;
  /** An import rejection with no specific offending question to attach to (e.g. an auth failure). */
  importFailureMessage: string | null;
  /** APPEND (default) or REPLACE — chosen before Import runs. */
  mode: ImportMode;
  /** Questions whose "Retry with AI" is still running; Import waits for them. */
  retryingIds: string[];
  /** Questions whose edit form is open; Import waits for them to close. */
  openEditIds: string[];
  /** An Add-mode import call threw, so the questions may be on the test already; Add stays locked until the teacher checks. */
  importOutcomeUnknown: boolean;
}

type ImportAiAction =
  | { type: "READ_START"; fileName: string }
  | { type: "ERROR"; message: string }
  | {
      type: "PARSED_READY";
      readId: string;
      documentText: string;
      pictures: ReviewPicture[];
      questions: ImportQuestionDraft[];
    }
  | { type: "RESET" }
  | { type: "CHANGE"; change: Change }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RETRY_RESULT"; id: string; patch: RetryPatch }
  | { type: "IMPORT_START" }
  | {
      type: "IMPORT_FAILED";
      message: string;
      /** The message without any question prefix, for views that label it themselves. */
      reason: string;
      questionId: string | null;
      /** The call never answered, so the server may have written the questions. */
      outcomeUnknown?: boolean;
    }
  | { type: "CONFIRM_NOTHING_ADDED" }
  | { type: "SET_MODE"; mode: ImportMode }
  | { type: "RETRY_START"; id: string }
  | { type: "RETRY_END"; id: string }
  | { type: "RETRY_FAILED"; id: string; message: string }
  | { type: "EDIT_OPENED"; id: string }
  | { type: "EDIT_CLOSED"; id: string };

const initialState: ImportAiState = {
  documentText: "",
  pictures: [],
  readId: null,
  base: [],
  changes: [],
  redo: [],
  retryErrors: {},
  importErrors: {},
  error: null,
  phase: "idle",
  readingFileName: null,
  lastReadFileName: null,
  importFailureMessage: null,
  mode: "append",
  retryingIds: [],
  openEditIds: [],
  importOutcomeUnknown: false,
};

/** What leaving the page costs in each phase, shown by the admin layout's leave dialog. */
const LEAVE_MESSAGES: Record<ImportPhase, string> = {
  idle: "Your questions have not been imported yet. Leaving now discards them.",
  reading:
    "Your questions have not been imported yet. Leaving now discards them. A document still being read is not stopped; its result is thrown away.",
  importing:
    "Questions are being imported. Leaving won't stop the import; it will finish in the background.",
};

/** A minute past the server's AI call limit, so only a call the server never answers hits it. */
const READ_GIVE_UP_MS = AI_CALL_TIMEOUT_MS + 60_000;

/** The server may have written some or all questions (Replace may have deleted the old ones), so the teacher checks first. */
const IMPORT_UNREACHABLE_MESSAGE =
  "The import didn't finish because the connection to the server failed. Open the test page to check its questions before trying again.";

/** A second Add would append the questions again if the first one landed, so Import waits for the teacher's check. */
const ADD_IMPORT_UNREACHABLE_MESSAGE =
  "The import didn't finish because the connection to the server failed, so the questions may have been added anyway. Import stays off until you check the test page.";

/** Matches the existing course-material upload limit. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Checks a picked file's type and size, which needs no reading.
 * @param file - The file the teacher picked.
 * @returns The message to show, or null when the file may be read.
 */
export function checkDocumentFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "docx" && extension !== "pdf") {
    return "Upload a .docx or .pdf file.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES)
    return "The file must be 10 MB or smaller.";
  return null;
}

/**
 * Reduces the AI-import screen: the read/import phase and the drafts' change
 * history behind Undo/Redo.
 */
function importAiReducer(
  state: ImportAiState,
  action: ImportAiAction,
): ImportAiState {
  switch (action.type) {
    case "READ_START":
      return {
        ...state,
        phase: "reading",
        readingFileName: action.fileName,
        error: null,
      };
    case "ERROR":
      return { ...state, phase: "idle", error: action.message };
    case "PARSED_READY":
      return {
        ...state,
        // The old list's page-level import error does not describe the new list.
        importFailureMessage: null,
        phase: "idle",
        lastReadFileName: state.readingFileName,
        importOutcomeUnknown: false,
        documentText: action.documentText,
        pictures: action.pictures,
        readId: action.readId,
        base: action.questions,
        changes: [],
        redo: [],
        retryErrors: {},
        importErrors: {},
      };
    case "RESET":
      return initialState;
    case "CHANGE": {
      if (action.change.kind === "edit") {
        const { id, fields } = action.change;
        const current = replay(state.base, state.changes).find(
          (draft) => draft.id === id,
        );
        // An unchanged save records nothing, so Redo survives and the draft isn't marked hand-edited.
        if (current && sameFields(editableFieldsOf(current), fields)) {
          return state;
        }
      }
      return {
        ...state,
        changes: [...state.changes, action.change],
        redo: [],
      };
    }
    case "UNDO": {
      if (state.phase !== "idle") return state;
      const undone = state.changes.at(-1);
      if (!undone) return state;
      return {
        ...state,
        changes: state.changes.slice(0, -1),
        redo: [...state.redo, undone],
      };
    }
    case "REDO": {
      if (state.phase !== "idle") return state;
      const redone = state.redo.at(-1);
      if (!redone) return state;
      return {
        ...state,
        changes: [...state.changes, redone],
        redo: state.redo.slice(0, -1),
      };
    }
    case "RETRY_RESULT": {
      // The question may be gone by the time its answer arrives.
      if (
        !replay(state.base, state.changes).some(
          (draft) => draft.id === action.id,
        )
      ) {
        return state;
      }
      const { [action.id]: _retryError, ...retryErrors } = state.retryErrors;
      const { [action.id]: _importError, ...importErrors } = state.importErrors;
      return {
        ...state,
        changes: [
          ...state.changes,
          { kind: "retry", id: action.id, patch: action.patch },
        ],
        redo: [],
        retryErrors,
        importErrors,
      };
    }
    case "IMPORT_START":
      // Clears any stale rejection from a prior attempt before this one runs.
      return {
        ...state,
        phase: "importing",
        importFailureMessage: null,
        importErrors: {},
      };
    case "IMPORT_FAILED":
      return {
        ...state,
        phase: "idle",
        importFailureMessage: action.questionId ? null : action.message,
        // Replace deletes before it writes, so only a lost Add can leave duplicates behind.
        importOutcomeUnknown:
          state.importOutcomeUnknown ||
          (action.outcomeUnknown === true && state.mode === "append"),
        importErrors: action.questionId
          ? {
              ...state.importErrors,
              [action.questionId]: {
                message: action.message,
                reason: action.reason,
              },
            }
          : state.importErrors,
      };
    case "CONFIRM_NOTHING_ADDED":
      return {
        ...state,
        importOutcomeUnknown: false,
        importFailureMessage: null,
      };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "RETRY_START":
      return {
        ...state,
        retryingIds: [
          ...state.retryingIds.filter((id) => id !== action.id),
          action.id,
        ],
      };
    case "RETRY_END":
      return {
        ...state,
        retryingIds: state.retryingIds.filter((id) => id !== action.id),
      };
    case "RETRY_FAILED":
      return {
        ...state,
        retryingIds: state.retryingIds.filter((id) => id !== action.id),
        retryErrors: { ...state.retryErrors, [action.id]: action.message },
      };
    case "EDIT_OPENED":
      return {
        ...state,
        openEditIds: [
          ...state.openEditIds.filter((id) => id !== action.id),
          action.id,
        ],
      };
    case "EDIT_CLOSED":
      return {
        ...state,
        openEditIds: state.openEditIds.filter((id) => id !== action.id),
      };
    default:
      return state;
  }
}

interface ImportAiContextValue
  extends Omit<
    ImportAiState,
    "base" | "changes" | "redo" | "retryErrors" | "importErrors"
  > {
  /** The drafts as the teacher sees them: the read plus every change in effect. */
  questions: ImportQuestionDraft[];
  /** The drafts as they would be listed once Undo took back the latest change. */
  questionsAfterUndo: ImportQuestionDraft[];
  /** A file is being read or the import is writing. */
  isBusy: boolean;
  isReading: boolean;
  isImporting: boolean;
  /** Work the teacher would lose: a read is running, drafts are on screen or changes can be undone. */
  hasWorkOnScreen: boolean;
  selectFile: (file: File) => Promise<void>;
  /** Saves a hand-edit of a draft's text fields. */
  saveEdit: (id: string, fields: EditableFields) => void;
  /** The change Undo would take back, or null when there is none. */
  undoChange: Change | null;
  /** The change Redo would bring back, or null when there is none. */
  redoChange: Change | null;
  undo: () => void;
  redo: () => void;
  removePicture: (id: string, number: number) => void;
  /** Takes a draft out of the list; Undo brings it back. */
  removeQuestion: (id: string) => void;
  addPicture: (id: string, number: number) => void;
  /** Moves a picture from one draft to another; Undo moves it back. */
  movePicture: (number: number, fromId: string, toId: string) => void;
  retryOneQuestion: (id: string, correctionNote: string) => Promise<void>;
  cancelRetry: (id: string) => void;
  /** Tells the screen a question's edit form opened or closed. */
  setEditOpen: (id: string, isOpen: boolean) => void;
  /** Writes the reviewed list onto the test in the current `mode`. Resolves true on success. */
  importQuestions: (testId: string, courseId: string) => Promise<boolean>;
  /** The teacher checked the test page after a lost Add import and found nothing added. */
  confirmNothingAdded: () => void;
  setMode: (mode: ImportMode) => void;
  reset: () => void;
}

/**
 * Strips the review-list-only fields (`id`, `edited`, `retryError`,
 * `importError`, `imageNumbers`), leaving exactly the shape the server action
 * accepts, with the question's pictures already uploaded. A text that is only
 * picture markers is saved as the "Picture k" students see.
 * @param draft - One reviewed draft.
 * @param media - Its uploaded pictures.
 * @param pictureNumbers - The `[image N]` numbers of its pictures, in saved order.
 * @returns The question as the import action takes it.
 */
function toReviewedQuestion(
  draft: ImportQuestionDraft,
  media: SubmittedMedia,
  pictureNumbers: readonly number[],
): ReviewedQuestion {
  return {
    title: pictureReferenceText(draft.title, pictureNumbers),
    content: pictureReferenceText(draft.content, pictureNumbers),
    type: draft.type,
    options: draft.options?.map((option) => ({
      ...option,
      text: pictureReferenceText(option.text, pictureNumbers),
    })),
    referenceAnswer: draft.referenceAnswer,
    explanation: draft.explanation,
    media,
  };
}

/**
 * Releases the browser memory behind each picture's preview.
 * @param pictures - Pictures whose previews are no longer shown.
 */
function revokePreviews(pictures: ReviewPicture[]): void {
  for (const picture of pictures) URL.revokeObjectURL(picture.previewUrl);
}

const ImportAiContext = createContext<ImportAiContextValue | null>(null);

/**
 * Tells the server a document could not be read, so the failure is visible
 * in telemetry even though nothing reached the AI.
 * @param report - What went wrong; never the file's name or content.
 */
async function reportReadFailure(
  report: DocumentReadFailureReport,
): Promise<void> {
  // Best-effort boundary: a failed report must never reach the teacher.
  try {
    await reportDocumentReadFailureAction(report);
  } catch {}
}

/**
 * Provides AI-import stage state and the async file-selection callback.
 */
export function ImportAiProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(importAiReducer, initialState);
  const questions = useMemo(
    () =>
      replay(state.base, state.changes).map((draft) => ({
        ...draft,
        retryError: state.retryErrors[draft.id] ?? null,
        importError: state.importErrors[draft.id]?.message ?? null,
        importReason: state.importErrors[draft.id]?.reason ?? null,
      })),
    [state.base, state.changes, state.retryErrors, state.importErrors],
  );
  const questionsAfterUndo = useMemo(
    () => replay(state.base, state.changes.slice(0, -1)),
    [state.base, state.changes],
  );
  // The running retry of each question; a retry whose entry is gone was cancelled.
  const runningRetries = useRef(new Map<string, object>());
  // A second Import, or a picture two questions share, reuses an earlier upload instead of minting a new key.
  const uploaded = useRef<UploadedPictures>({ readId: null, media: new Map() });

  /**
   * Extracts the selected document's text in the browser, then asks the
   * server to turn it into structured draft questions for review. Only the
   * extracted text ever crosses the wire — the file itself never does.
   */
  async function selectFile(file: File): Promise<void> {
    // The current cards stay on screen while this file is read, so their previews must outlive the read.
    const previousPictures = state.pictures;
    function settle(action: ImportAiAction): void {
      // A failed read leaves the old list, so its previews stay in use.
      if (action.type === "PARSED_READY") revokePreviews(previousPictures);
      // The banner sits above the old list, so it must say which file it is about.
      if (action.type === "ERROR") {
        dispatch({ ...action, message: `${file.name} — ${action.message}` });
        return;
      }
      dispatch(action);
    }

    const rejection = checkDocumentFile(file);
    if (rejection) {
      settle({ type: "ERROR", message: rejection });
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    dispatch({ type: "READ_START", fileName: file.name });
    const fileType =
      extension === "docx" ? DocumentFileType.Docx : DocumentFileType.Pdf;

    // Boundary: a damaged or locked file throws inside the parser library,
    // which would otherwise leave the picker stuck on busy.
    let text: string;
    let pictures: DocumentPicture[];
    try {
      ({ text, pictures } =
        extension === "docx"
          ? await extractDocx(file)
          : { text: await extractTextFromPdf(file), pictures: [] });
    } catch (error) {
      settle({
        type: "ERROR",
        message:
          "This document could not be read. It may be damaged or password-protected. Try a different file.",
      });
      void reportReadFailure({
        fileType,
        fileSizeBytes: file.size,
        reason: DocumentReadFailure.ExtractionFailed,
        errorName: error instanceof Error ? error.name : undefined,
      });
      return;
    }

    // Nothing is sent to the AI provider when no text was read — this short-circuit
    // is what makes that true by construction, not a server-side check.
    if (text.trim().length === 0) {
      settle({
        type: "ERROR",
        message:
          "No text could be read from this document. Try a different file.",
      });
      void reportReadFailure({
        fileType,
        fileSizeBytes: file.size,
        reason: DocumentReadFailure.NoText,
      });
      return;
    }

    // Boundary: a dropped connection rejects the call, and a killed server never answers; either would leave the picker on busy.
    let result: Awaited<ReturnType<typeof parseQuestionsAction>>;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    try {
      const gaveUp = new Promise<"gave-up">((resolve) => {
        giveUp = setTimeout(() => resolve("gave-up"), READ_GIVE_UP_MS);
      });
      const outcome = await Promise.race([
        parseQuestionsAction(
          text,
          pictures.map((picture) => picture.number),
        ),
        gaveUp,
      ]);
      if (outcome === "gave-up") {
        settle({
          type: "ERROR",
          message: AI_FAILURE_MESSAGES[AiFailureCause.Timeout],
        });
        return;
      }
      result = outcome;
    } catch {
      settle({
        type: "ERROR",
        message: AI_FAILURE_MESSAGES[AiFailureCause.Busy],
      });
      return;
    } finally {
      clearTimeout(giveUp);
    }
    if (!result.success || !result.questions) {
      settle({ type: "ERROR", message: result.message });
      return;
    }

    // `![]` is `false` — a successful parse finding zero questions is not
    // caught by the check above, so it needs its own branch or the teacher
    // sees the bare picker again with no distinguishing feedback at all.
    if (result.questions.length === 0) {
      settle({
        type: "ERROR",
        message:
          "No questions were found in this document. Try a different file.",
      });
      return;
    }

    settle({
      type: "PARSED_READY",
      readId: crypto.randomUUID(),
      documentText: text,
      pictures: pictures.map((picture) => ({
        ...picture,
        previewUrl: URL.createObjectURL(picture.file),
      })),
      questions: result.questions.map((q) => ({
        id: crypto.randomUUID(),
        edited: false,
        retryError: null,
        importError: null,
        importReason: null,
        ...q,
      })),
    });
  }

  /**
   * Asks the AI to re-read one question, addressing the teacher's correction
   * note. Splices the result back by `id` — captured in this call's own
   * closure, never "whichever dialog is open" — so two in-flight retries
   * can't cross. On failure the pre-retry draft stays visible and intact.
   * The question keeps its pictures.
   */
  async function retryOneQuestion(
    id: string,
    correctionNote: string,
  ): Promise<void> {
    const current = questions.find((q) => q.id === id);
    if (!current) return;

    const retry = {};
    runningRetries.current.set(id, retry);
    dispatch({ type: "RETRY_START", id });
    // Boundary: a dropped connection rejects the call, which would otherwise leave the card on "Retrying…".
    let result: Awaited<ReturnType<typeof retryQuestionAction>>;
    try {
      result = await retryQuestionAction(
        state.documentText,
        current,
        correctionNote,
      );
    } catch {
      result = {
        success: false,
        message: AI_FAILURE_MESSAGES[AiFailureCause.Busy],
      };
    }
    // Cancelled (or replaced) while the AI was reading: its answer is dropped.
    if (runningRetries.current.get(id) !== retry) return;
    runningRetries.current.delete(id);
    if (!result.success || !result.question) {
      dispatch({ type: "RETRY_FAILED", id, message: result.message });
      return;
    }
    dispatch({ type: "RETRY_END", id });

    // Name every ParsedQuestion field explicitly rather than `...result.question`
    // — a field the AI omits (e.g. `options` after a type correction) must
    // become an explicit `undefined` here so the reducer's merge clears the
    // stale value, instead of silently depending on whether the key was
    // present on the object at all.
    const question = result.question;
    dispatch({
      type: "RETRY_RESULT",
      id,
      patch: {
        title: question.title,
        content: question.content,
        type: question.type,
        options: question.options,
        referenceAnswer: question.referenceAnswer,
        explanation: question.explanation,
      },
    });
  }

  /**
   * Gives up on a question's running retry: its answer is discarded when it
   * arrives and Import unlocks now. The AI request already sent still
   * completes server-side (and is recorded); only its result is dropped.
   */
  function cancelRetry(id: string): void {
    runningRetries.current.delete(id);
    dispatch({ type: "RETRY_END", id });
  }

  /**
   * Writes the current review list onto the test in the current `mode`
   * (APPEND or REPLACE). On rejection, the action's message is routed to
   * the ONE offending question by position rather than shown as a bare
   * page-level banner; a rejection with no specific offender (e.g. an auth
   * failure) falls back to `importFailureMessage`, as does a call that
   * never reached the server.
   */
  async function importQuestions(
    testId: string,
    courseId: string,
  ): Promise<boolean> {
    dispatch({ type: "IMPORT_START" });

    // Checked before any upload, so no picture is stored for an import that cannot succeed.
    const overfull = questions.find(
      (draft) =>
        picturesOf(draft, state.pictures).length > MAX_MEDIA_PER_QUESTION,
    );
    if (overfull) {
      // Worded like the server's own refusal of a fourth file.
      const detail = `A question can have at most ${MAX_MEDIA_PER_QUESTION} media files`;
      dispatch({
        type: "IMPORT_FAILED",
        message: `This question's pictures could not be uploaded: ${detail}`,
        reason: `Its pictures could not be uploaded: ${detail}`,
        questionId: overfull.id,
      });
      return false;
    }
    // Saving would name a picture students cannot see, so it is refused before any upload.
    for (const draft of questions) {
      const missing = missingPictureReference(
        draft,
        picturesOf(draft, state.pictures).map((picture) => picture.number),
      );
      if (!missing) continue;
      const reason = `${missing.label} names a picture this question no longer has`;
      dispatch({
        type: "IMPORT_FAILED",
        message: reason,
        reason,
        questionId: draft.id,
      });
      return false;
    }

    // A new read starts with nothing uploaded.
    if (uploaded.current.readId !== state.readId) {
      uploaded.current = { readId: state.readId, media: new Map() };
    }
    const { media } = uploaded.current;

    // A missing picture goes with the first question that shows it, so a shared picture uploads once.
    const claimed = new Set<number>();
    const uploads = questions
      .map((draft) => {
        const missing = picturesOf(draft, state.pictures).filter(
          (picture) =>
            !media.has(picture.number) && !claimed.has(picture.number),
        );
        for (const picture of missing) claimed.add(picture.number);
        return { draft, missing };
      })
      .filter(({ missing }) => missing.length > 0);

    const failure = await runInOrder(
      uploads.map(({ missing }) => async () => {
        const entries = await uploadPictures(
          missing.map((picture) => picture.file),
        );
        missing.forEach((picture, i) => {
          const { order: _order, ...entry } = entries[i];
          media.set(picture.number, entry);
        });
      }),
      UPLOAD_CONCURRENCY,
    );
    // A failed upload lands on the earliest failing question, and nothing is imported.
    if (failure) {
      const { error } = failure;
      const detail = error instanceof Error ? error.message : "unknown error";
      dispatch({
        type: "IMPORT_FAILED",
        message: `This question's pictures could not be uploaded: ${detail}`,
        reason: `Its pictures could not be uploaded: ${detail}`,
        questionId: uploads[failure.index].draft.id,
      });
      return false;
    }

    // Kept in review order — the write loop numbers the questions by it.
    const reviewed = questions.map((draft) => {
      const shown = picturesOf(draft, state.pictures);
      return toReviewedQuestion(
        draft,
        shown
          .flatMap((picture) => media.get(picture.number) ?? [])
          .map((entry, order) => ({ ...entry, order })),
        shown.map((picture) => picture.number),
      );
    });

    // Boundary: a dropped connection rejects the call, which would otherwise leave the screen on "Importing…".
    let result: Awaited<ReturnType<typeof importAiQuestionsAction>>;
    try {
      result = await importAiQuestionsAction(
        testId,
        courseId,
        reviewed,
        state.mode,
      );
    } catch {
      const message =
        state.mode === "append"
          ? ADD_IMPORT_UNREACHABLE_MESSAGE
          : IMPORT_UNREACHABLE_MESSAGE;
      dispatch({
        type: "IMPORT_FAILED",
        message,
        reason: message,
        questionId: null,
        outcomeUnknown: true,
      });
      return false;
    }
    if (!result.success) {
      // Cached keys may belong to a school that is no longer active (switched in another tab), so the next Import mints fresh ones.
      if (result.invalidQuestionReason === INVALID_MEDIA_KEY_MESSAGE) {
        uploaded.current = { readId: null, media: new Map() };
      }
      const offender =
        result.invalidQuestionIndex !== undefined
          ? questions[result.invalidQuestionIndex]
          : undefined;
      dispatch({
        type: "IMPORT_FAILED",
        message: result.message,
        reason: result.invalidQuestionReason ?? result.message,
        questionId: offender?.id ?? null,
      });
      return false;
    }

    revokePreviews(state.pictures);
    dispatch({ type: "RESET" });
    return true;
  }

  const setEditOpen = useCallback((id: string, isOpen: boolean) => {
    dispatch({ type: isOpen ? "EDIT_OPENED" : "EDIT_CLOSED", id });
  }, []);

  // A non-empty history counts, so deleting every draft still leaves something to lose.
  const hasWorkOnScreen =
    state.phase === "reading" ||
    questions.length > 0 ||
    state.changes.length > 0;

  // Lets the admin layout's links and Sign Out ask before leaving.
  const { setHasWork } = useLeaveGuard();
  useEffect(() => {
    setHasWork(hasWorkOnScreen, LEAVE_MESSAGES[state.phase]);
    return () => setHasWork(false);
  }, [hasWorkOnScreen, state.phase, setHasWork]);

  // Keyed on the boolean so the listener isn't re-added on every edit.
  useEffect(() => {
    if (!hasWorkOnScreen) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers only show their prompt when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWorkOnScreen]);

  const {
    base: _base,
    changes: _changes,
    redo: _redo,
    retryErrors: _retryErrors,
    importErrors: _importErrors,
    ...visibleState
  } = state;
  const value: ImportAiContextValue = {
    ...visibleState,
    questions,
    questionsAfterUndo,
    isBusy: state.phase !== "idle",
    isReading: state.phase === "reading",
    isImporting: state.phase === "importing",
    hasWorkOnScreen,
    selectFile,
    saveEdit: (id, fields) =>
      dispatch({
        type: "CHANGE",
        change: { kind: "edit", id, fields: editableFieldsOf(fields) },
      }),
    undoChange: state.changes.at(-1) ?? null,
    redoChange: state.redo.at(-1) ?? null,
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
    removePicture: (id, number) =>
      dispatch({
        type: "CHANGE",
        change: { kind: "removePicture", id, number },
      }),
    removeQuestion: (id) =>
      dispatch({ type: "CHANGE", change: { kind: "delete", id } }),
    movePicture: (number, fromId, toId) =>
      dispatch({
        type: "CHANGE",
        change: { kind: "movePicture", id: fromId, toId, number },
      }),
    addPicture: (id, number) =>
      dispatch({ type: "CHANGE", change: { kind: "addPicture", id, number } }),
    retryOneQuestion,
    cancelRetry,
    setEditOpen,
    importQuestions,
    confirmNothingAdded: () => dispatch({ type: "CONFIRM_NOTHING_ADDED" }),
    setMode: (mode) => dispatch({ type: "SET_MODE", mode }),
    reset: () => {
      runningRetries.current.clear();
      dispatch({ type: "RESET" });
    },
  };

  return (
    <ImportAiContext.Provider value={value}>
      {children}
    </ImportAiContext.Provider>
  );
}

/**
 * Reads AI-import state. Throws outside the provider.
 */
export function useImportAi(): ImportAiContextValue {
  const value = useContext(ImportAiContext);
  if (!value) {
    throw new Error("useImportAi must be used within ImportAiProvider");
  }
  return value;
}
