"use client";

import { createContext, useContext, useReducer } from "react";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import {
  type ImportMode,
  importAiQuestionsAction,
  parseQuestionsAction,
  retryQuestionAction,
} from "./actions";
import { extractTextFromDocx, extractTextFromPdf } from "./document-extract";

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
}

interface ImportAiState {
  documentText: string;
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
      questions: ImportQuestionDraft[];
    }
  | { type: "RESET" }
  | {
      type: "UPDATE_QUESTION";
      id: string;
      patch: Partial<Omit<ImportQuestionDraft, "id">>;
    }
  | { type: "IMPORT_START" }
  | { type: "IMPORT_FAILED"; message: string; questionId: string | null }
  | { type: "SET_MODE"; mode: ImportMode };

const initialState: ImportAiState = {
  documentText: "",
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
        questions: state.questions.map((q) => ({ ...q, importError: null })),
      };
    case "IMPORT_FAILED":
      return {
        ...state,
        isBusy: false,
        importFailureMessage: action.questionId ? null : action.message,
        questions: action.questionId
          ? state.questions.map((q) =>
              q.id === action.questionId
                ? { ...q, importError: action.message }
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
 * `importError`), leaving exactly the shape the server action accepts, in
 * the same order the teacher left the list — that order is what the write
 * loop uses for `order` (Step 17).
 */
function toReviewedQuestions(drafts: ImportQuestionDraft[]): ParsedQuestion[] {
  return drafts.map((draft) => ({
    title: draft.title,
    content: draft.content,
    type: draft.type,
    options: draft.options,
    referenceAnswer: draft.referenceAnswer,
    explanation: draft.explanation,
  }));
}

const ImportAiContext = createContext<ImportAiContextValue | null>(null);

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
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "docx" && extension !== "pdf") {
      dispatch({ type: "ERROR", message: "Upload a .docx or .pdf file." });
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      dispatch({
        type: "ERROR",
        message: "The file must be 10 MB or smaller.",
      });
      return;
    }

    dispatch({ type: "BUSY" });

    const text =
      extension === "docx"
        ? await extractTextFromDocx(file)
        : await extractTextFromPdf(file);

    // Nothing is sent to Google when no text was read — this short-circuit
    // is what makes that true by construction, not a server-side check.
    if (text.trim().length === 0) {
      dispatch({
        type: "ERROR",
        message:
          "No text could be read from this document. Try a different file.",
      });
      return;
    }

    const result = await parseQuestionsAction(text);
    if (!result.success || !result.questions) {
      dispatch({ type: "ERROR", message: result.message });
      return;
    }

    dispatch({
      type: "PARSED_READY",
      documentText: text,
      questions: result.questions.map((q) => ({
        id: crypto.randomUUID(),
        edited: false,
        retryError: null,
        importError: null,
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
        edited: false,
        retryError: null,
        importError: null,
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

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      toReviewedQuestions(state.questions),
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
        questionId: offender?.id ?? null,
      });
      return false;
    }

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
