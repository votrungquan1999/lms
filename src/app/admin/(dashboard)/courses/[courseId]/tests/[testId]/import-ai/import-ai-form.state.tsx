"use client";

import { createContext, useContext, useReducer } from "react";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
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

interface ImportAiState {
  documentText: string;
  /** Every picture the document had, keyed by its `[image N]` number. */
  pictures: ReviewPicture[];
  questions: ImportQuestionDraft[];
  error: string | null;
  isBusy: boolean;
  /** An import rejection with no specific offending question to attach to (e.g. an auth failure). */
  importFailureMessage: string | null;
  /** D37: APPEND (default) or REPLACE (Step 34) — chosen before Import runs. */
  mode: ImportMode;
}

type ImportAiAction =
  | { type: "BUSY" }
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
  | { type: "SET_MODE"; mode: ImportMode };

const initialState: ImportAiState = {
  documentText: "",
  pictures: [],
  questions: [],
  error: null,
  isBusy: false,
  importFailureMessage: null,
  mode: "append",
};

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
    case "BUSY":
      return { ...state, isBusy: true, error: null };
    case "ERROR":
      return { ...initialState, error: action.message };
    case "PARSED_READY":
      return {
        ...state,
        isBusy: false,
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
        isBusy: true,
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
        isBusy: false,
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
    default:
      return state;
  }
}

interface ImportAiContextValue extends ImportAiState {
  selectFile: (file: File) => Promise<void>;
  updateQuestion: (
    id: string,
    patch: Partial<Omit<ImportQuestionDraft, "id">>,
  ) => void;
  retryOneQuestion: (id: string, correctionNote: string) => Promise<void>;
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

    dispatch({ type: "BUSY" });
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

    const result = await parseQuestionsAction(text);
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

    const result = await retryQuestionAction(
      state.documentText,
      current,
      correctionNote,
    );
    if (!result.success || !result.question) {
      dispatch({
        type: "UPDATE_QUESTION",
        id,
        patch: { retryError: result.message },
      });
      return;
    }

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
      const files = state.pictures
        .filter((picture) => draft.imageNumbers?.includes(picture.number))
        .map((picture) => picture.file);
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

  const value: ImportAiContextValue = {
    ...state,
    selectFile,
    updateQuestion: (id, patch) =>
      dispatch({ type: "UPDATE_QUESTION", id, patch }),
    retryOneQuestion,
    importQuestions,
    setMode: (mode) => dispatch({ type: "SET_MODE", mode }),
    reset: () => dispatch({ type: "RESET" }),
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
