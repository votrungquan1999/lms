"use client";

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
} from "react";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import {
  AI_FAILURE_MESSAGES,
  AiFailureCause,
} from "src/lib/ai/ai-failure-messages";
import type { MediaContentType } from "src/lib/question-service";
import type { SubmittedMedia } from "../question-media.schema";
import { requestUploadSlotsAction } from "../question-media-actions";
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
import { reportDocumentReadFailureAction } from "./read-failure-actions";

/**
 * One parsed question in the review list, keyed by a stable client id.
 * `edited` (D40) tracks whether a teacher has hand-corrected this draft since
 * it last arrived from the AI, so a retry can warn before discarding it.
 * `retryError` surfaces a failed retry without blanking the pre-retry draft.
 * `importError` surfaces Step 18's named rejection against the ONE offending
 * question, instead of a bare page-level banner (Step 33's own scope note).
 */
export interface ImportQuestionDraft extends ParsedQuestion {
  id: string;
  edited: boolean;
  retryError: string | null;
  importError: string | null;
  /** `importError` without its question prefix; Student view leads it with its own label. */
  importReason: string | null;
}

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

/** What the screen is waiting on: nothing, the AI reading a file, or the import writing. */
type ImportPhase = "idle" | "reading" | "importing";

interface ImportAiState {
  documentText: string;
  /** Every picture the document had, keyed by its `[image N]` number. */
  pictures: ReviewPicture[];
  questions: ImportQuestionDraft[];
  error: string | null;
  phase: ImportPhase;
  /** The file being read, since the file input is cleared on every pick. */
  readingFileName: string | null;
  /** An import rejection with no specific offending question to attach to (e.g. an auth failure). */
  importFailureMessage: string | null;
  /** D37: APPEND (default) or REPLACE (Step 34) — chosen before Import runs. */
  mode: ImportMode;
  /** Questions whose "Retry with AI" is still running; Import waits for them. */
  retryingIds: string[];
  /** Questions whose edit form is open; Import waits for them to close. */
  openEditIds: string[];
}

type ImportAiAction =
  | { type: "READ_START"; fileName: string }
  | { type: "ERROR"; message: string }
  | {
      type: "PARSED_READY";
      documentText: string;
      pictures: ReviewPicture[];
      questions: ImportQuestionDraft[];
    }
  | { type: "RESET" }
  | {
      type: "UPDATE_QUESTION";
      id: string;
      patch: Partial<Omit<ImportQuestionDraft, "id">>;
    }
  | { type: "IMPORT_START" }
  | {
      type: "IMPORT_FAILED";
      message: string;
      /** The message without any question prefix, for views that label it themselves. */
      reason: string;
      questionId: string | null;
    }
  | { type: "SET_MODE"; mode: ImportMode }
  | { type: "RETRY_START"; id: string }
  | { type: "RETRY_END"; id: string }
  | { type: "RETRY_FAILED"; id: string; message: string }
  | { type: "EDIT_OPENED"; id: string }
  | { type: "EDIT_CLOSED"; id: string };

const initialState: ImportAiState = {
  documentText: "",
  pictures: [],
  questions: [],
  error: null,
  phase: "idle",
  readingFileName: null,
  importFailureMessage: null,
  mode: "append",
  retryingIds: [],
  openEditIds: [],
};

/** Just over the server's AI call limit (AI_CALL_TIMEOUT_MS, 240 s), so only a call the server never answers hits it. */
const READ_GIVE_UP_MS = 300_000;

/** D41 — matches the existing course-material upload limit. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Reduces the AI-import stage machine: file → busy → error, matching the
 * bulk-student-import reducer shape.
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
      return { ...initialState, error: action.message };
    case "PARSED_READY":
      return {
        ...state,
        phase: "idle",
        documentText: action.documentText,
        pictures: action.pictures,
        questions: action.questions,
      };
    case "RESET":
      return initialState;
    case "UPDATE_QUESTION":
      return {
        ...state,
        questions: state.questions.map((q) =>
          q.id === action.id ? { ...q, ...action.patch } : q,
        ),
      };
    case "IMPORT_START":
      // Clears any stale rejection from a prior attempt before this one runs.
      return {
        ...state,
        phase: "importing",
        importFailureMessage: null,
        questions: state.questions.map((q) => ({
          ...q,
          importError: null,
          importReason: null,
        })),
      };
    case "IMPORT_FAILED":
      return {
        ...state,
        phase: "idle",
        importFailureMessage: action.questionId ? null : action.message,
        questions: action.questionId
          ? state.questions.map((q) =>
              q.id === action.questionId
                ? {
                    ...q,
                    importError: action.message,
                    importReason: action.reason,
                  }
                : q,
            )
          : state.questions,
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
        questions: state.questions.map((q) =>
          q.id === action.id ? { ...q, retryError: action.message } : q,
        ),
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

interface ImportAiContextValue extends ImportAiState {
  /** A file is being read or the import is writing. */
  isBusy: boolean;
  isReading: boolean;
  isImporting: boolean;
  selectFile: (file: File) => Promise<void>;
  updateQuestion: (
    id: string,
    patch: Partial<Omit<ImportQuestionDraft, "id">>,
  ) => void;
  retryOneQuestion: (id: string, correctionNote: string) => Promise<void>;
  cancelRetry: (id: string) => void;
  /** Tells the screen a question's edit form opened or closed. */
  setEditOpen: (id: string, isOpen: boolean) => void;
  /** Writes the reviewed list onto the test in the current `mode`. Resolves true on success. */
  importQuestions: (testId: string, courseId: string) => Promise<boolean>;
  setMode: (mode: ImportMode) => void;
  reset: () => void;
}

/**
 * Strips the review-list-only fields (`id`, `edited`, `retryError`,
 * `importError`, `imageNumbers`), leaving exactly the shape the server action
 * accepts, with the question's pictures already uploaded.
 * @param draft - One reviewed draft.
 * @param media - Its uploaded pictures.
 * @returns The question as the import action takes it.
 */
function toReviewedQuestion(
  draft: ImportQuestionDraft,
  media: SubmittedMedia,
): ReviewedQuestion {
  return {
    title: draft.title,
    content: draft.content,
    type: draft.type,
    options: draft.options,
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

/**
 * Uploads one question's pictures straight to storage, the same way the
 * add-question form uploads media, and returns the entries to save with it.
 * @param files - The question's pictures, in document order.
 * @returns The uploaded media entries, in order.
 */
async function uploadPictures(files: File[]): Promise<SubmittedMedia> {
  if (files.length === 0) return [];

  const slotResult = await requestUploadSlotsAction(
    files.map((file) => ({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })),
  );
  if (!slotResult.success || !slotResult.slots) {
    throw new Error(slotResult.message);
  }

  const { slots } = slotResult;
  await Promise.all(
    slots.map((slot, i) =>
      fetch(slot.url, {
        method: "PUT",
        headers: { "Content-Type": files[i].type },
        body: files[i],
      }).then((res) => {
        if (!res.ok) throw new Error(`Upload failed for ${files[i].name}`);
      }),
    ),
  );

  return slots.map((slot, i) => ({
    fileName: files[i].name,
    contentType: files[i].type as MediaContentType,
    size: files[i].size,
    key: slot.key,
    order: slot.order,
  }));
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
  // The running retry of each question; a retry whose entry is gone was cancelled.
  const runningRetries = useRef(new Map<string, object>());

  /**
   * Extracts the selected document's text in the browser, then asks the
   * server to turn it into structured draft questions for review. Only the
   * extracted text ever crosses the wire — the file itself never does.
   */
  async function selectFile(file: File): Promise<void> {
    // The current cards stay on screen while this file is read, so their
    // previews are freed only when this file's outcome replaces them.
    const previousPictures = state.pictures;
    function settle(action: ImportAiAction): void {
      revokePreviews(previousPictures);
      dispatch(action);
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "docx" && extension !== "pdf") {
      settle({ type: "ERROR", message: "Upload a .docx or .pdf file." });
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      settle({
        type: "ERROR",
        message: "The file must be 10 MB or smaller.",
      });
      return;
    }

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

    // Nothing is sent to Google when no text was read — this short-circuit
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
   */
  async function retryOneQuestion(
    id: string,
    correctionNote: string,
  ): Promise<void> {
    const current = state.questions.find((q) => q.id === id);
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
    // A fresh AI result is no longer "hand-edited" and clears any prior error.
    dispatch({
      type: "UPDATE_QUESTION",
      id,
      patch: {
        title: question.title,
        content: question.content,
        type: question.type,
        options: question.options,
        referenceAnswer: question.referenceAnswer,
        explanation: question.explanation,
        imageNumbers: question.imageNumbers,
        edited: false,
        retryError: null,
        importError: null,
        importReason: null,
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
   * (D37: APPEND or REPLACE). On rejection, Step 18's message is routed to
   * the ONE offending question by position rather than shown as a bare
   * page-level banner; a rejection with no specific offender (e.g. an auth
   * failure) falls back to `importFailureMessage`.
   */
  async function importQuestions(
    testId: string,
    courseId: string,
  ): Promise<boolean> {
    dispatch({ type: "IMPORT_START" });

    // Kept in review order — the write loop numbers the questions by it (Step 17).
    const reviewed: ReviewedQuestion[] = [];
    for (const draft of state.questions) {
      const files = picturesOf(draft, state.pictures).map(
        (picture) => picture.file,
      );
      // Boundary: a failed upload lands on its own question, and nothing is imported.
      try {
        reviewed.push(toReviewedQuestion(draft, await uploadPictures(files)));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        dispatch({
          type: "IMPORT_FAILED",
          message: `This question's pictures could not be uploaded: ${detail}`,
          reason: `Its pictures could not be uploaded: ${detail}`,
          questionId: draft.id,
        });
        return false;
      }
    }

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      reviewed,
      state.mode,
    );
    if (!result.success) {
      const offender =
        result.invalidQuestionIndex !== undefined
          ? state.questions[result.invalidQuestionIndex]
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

  const value: ImportAiContextValue = {
    ...state,
    isBusy: state.phase !== "idle",
    isReading: state.phase === "reading",
    isImporting: state.phase === "importing",
    selectFile,
    updateQuestion: (id, patch) =>
      dispatch({ type: "UPDATE_QUESTION", id, patch }),
    retryOneQuestion,
    cancelRetry,
    setEditOpen,
    importQuestions,
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
