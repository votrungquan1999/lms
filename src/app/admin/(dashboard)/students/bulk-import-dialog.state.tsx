"use client";

import { createContext, useContext, useReducer } from "react";
import {
  bulkImportStudentsAction,
  previewImportAction,
} from "./bulk-import-actions";
import type {
  BulkImportAction,
  BulkImportState,
  CourseOption,
} from "./bulk-import-dialog.type";
import { ImportStage } from "./bulk-import-dialog.type";
import { ParseImportErrorKind, parseImportFile } from "./parse-import-file";

const initialState: BulkImportState = {
  stage: ImportStage.Idle,
  parsedRows: [],
  preview: [],
  previewSummary: null,
  selectedCourseIds: [],
  report: [],
  reportSummary: null,
  formatError: null,
  actionError: null,
  isBusy: false,
};

/** Human-readable message for each file-format error kind. */
const FORMAT_ERROR_MESSAGES: Record<ParseImportErrorKind, string> = {
  [ParseImportErrorKind.Unreadable]:
    "This file could not be read. Upload a .csv or .xlsx file.",
  [ParseImportErrorKind.MissingHeader]:
    "The file is missing a required column. It must have name, username and password columns.",
  [ParseImportErrorKind.NoRows]: "The file has no student rows.",
  [ParseImportErrorKind.TooManyRows]:
    "The file has more than 200 rows. Split it into smaller files.",
};

/**
 * Reduces the bulk-import stage machine: file → preview → report, plus
 * busy/error flags and course selection.
 */
function bulkImportReducer(
  state: BulkImportState,
  action: BulkImportAction,
): BulkImportState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "BUSY":
      return { ...state, isBusy: true, formatError: null, actionError: null };
    case "FORMAT_ERROR":
      return { ...initialState, formatError: action.message };
    case "ACTION_ERROR":
      return { ...state, isBusy: false, actionError: action.message };
    case "PREVIEW_READY":
      return {
        ...state,
        isBusy: false,
        stage: ImportStage.Previewed,
        parsedRows: action.parsedRows,
        preview: action.preview,
        previewSummary: action.summary,
      };
    case "TOGGLE_COURSE": {
      const isSelected = state.selectedCourseIds.includes(action.courseId);
      return {
        ...state,
        selectedCourseIds: isSelected
          ? state.selectedCourseIds.filter((id) => id !== action.courseId)
          : [...state.selectedCourseIds, action.courseId],
      };
    }
    case "REPORT_READY":
      return {
        ...state,
        isBusy: false,
        stage: ImportStage.Done,
        report: action.report,
        reportSummary: action.summary,
      };
    default:
      return state;
  }
}

interface BulkImportContextValue extends BulkImportState {
  courses: CourseOption[];
  selectFile: (file: File) => Promise<void>;
  toggleCourse: (courseId: string) => void;
  confirmImport: () => Promise<void>;
  reset: () => void;
}

const BulkImportContext = createContext<BulkImportContextValue | null>(null);

/**
 * Provides bulk-import stage state and the async action callbacks.
 */
export function BulkImportProvider({
  courses,
  children,
}: {
  courses: CourseOption[];
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(bulkImportReducer, initialState);

  /** Parses the selected file, then requests a server preview. */
  async function selectFile(file: File): Promise<void> {
    const parsed = await parseImportFile(file);
    if (!parsed.ok) {
      dispatch({
        type: "FORMAT_ERROR",
        message: FORMAT_ERROR_MESSAGES[parsed.error],
      });
      return;
    }
    dispatch({ type: "BUSY" });
    const result = await previewImportAction(parsed.rows);
    if (!result.success || !result.rows || !result.summary) {
      dispatch({ type: "ACTION_ERROR", message: result.message });
      return;
    }
    dispatch({
      type: "PREVIEW_READY",
      parsedRows: parsed.rows,
      preview: result.rows,
      summary: result.summary,
    });
  }

  /** Confirms the import, creating students and enrolling them. */
  async function confirmImport(): Promise<void> {
    dispatch({ type: "BUSY" });
    const result = await bulkImportStudentsAction(
      state.parsedRows,
      state.selectedCourseIds,
    );
    if (!result.success || !result.report || !result.summary) {
      dispatch({ type: "ACTION_ERROR", message: result.message });
      return;
    }
    dispatch({
      type: "REPORT_READY",
      report: result.report,
      summary: result.summary,
    });
  }

  const value: BulkImportContextValue = {
    ...state,
    courses,
    selectFile,
    toggleCourse: (courseId) => dispatch({ type: "TOGGLE_COURSE", courseId }),
    confirmImport,
    reset: () => dispatch({ type: "RESET" }),
  };

  return (
    <BulkImportContext.Provider value={value}>
      {children}
    </BulkImportContext.Provider>
  );
}

/**
 * Reads bulk-import dialog state. Throws outside the provider.
 */
export function useBulkImport(): BulkImportContextValue {
  const value = useContext(BulkImportContext);
  if (!value) {
    throw new Error("useBulkImport must be used within BulkImportProvider");
  }
  return value;
}
