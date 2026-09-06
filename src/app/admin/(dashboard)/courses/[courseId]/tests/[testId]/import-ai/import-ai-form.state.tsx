"use client";

import { createContext, useContext, useReducer } from "react";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { parseQuestionsAction } from "./actions";
import { extractTextFromDocx, extractTextFromPdf } from "./document-extract";

/** One parsed question in the review list, keyed by a stable client id. */
export interface ImportQuestionDraft extends ParsedQuestion {
  id: string;
}

interface ImportAiState {
  documentText: string;
  questions: ImportQuestionDraft[];
  error: string | null;
  isBusy: boolean;
}

type ImportAiAction =
  | { type: "BUSY" }
  | { type: "ERROR"; message: string }
  | {
      type: "PARSED_READY";
      documentText: string;
      questions: ImportQuestionDraft[];
    }
  | { type: "RESET" };

const initialState: ImportAiState = {
  documentText: "",
  questions: [],
  error: null,
  isBusy: false,
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
    default:
      return state;
  }
}

interface ImportAiContextValue extends ImportAiState {
  selectFile: (file: File) => Promise<void>;
  reset: () => void;
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
        ...q,
      })),
    });
  }

  const value: ImportAiContextValue = {
    ...state,
    selectFile,
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
