"use client";

import { createContext, useContext, useReducer } from "react";
import { MediaContentType } from "src/lib/question-service";
import {
  MAX_MEDIA_PER_QUESTION,
  MAX_MEDIA_SIZE_BYTES,
  type SubmittedMedia,
} from "./question-media.schema";
import { requestUploadSlotsAction } from "./question-media-actions";
import type {
  QuestionMediaPickerAction,
  QuestionMediaPickerState,
  SelectedMediaFile,
} from "./question-media-picker.type";

const ALLOWED_CONTENT_TYPES = Object.values(MediaContentType) as string[];

const initialState: QuestionMediaPickerState = {
  selectedFiles: [],
  validationError: null,
};

/**
 * Reducer for the question media picker.
 * @param state - Current picker state.
 * @param action - Action to apply.
 * @returns The next picker state.
 */
function questionMediaPickerReducer(
  state: QuestionMediaPickerState,
  action: QuestionMediaPickerAction,
): QuestionMediaPickerState {
  switch (action.type) {
    case "ADD_FILES":
      return {
        ...state,
        selectedFiles: [...state.selectedFiles, ...action.files],
      };
    case "REMOVE_FILE":
      return {
        ...state,
        selectedFiles: state.selectedFiles.filter((f) => f.id !== action.id),
        // Removing a file may resolve a count-exceeded error — clear it.
        validationError: null,
      };
    case "SET_ERROR":
      return { ...state, validationError: action.error };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface QuestionMediaPickerContextValue extends QuestionMediaPickerState {
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  uploadSelectedFiles: () => Promise<SubmittedMedia>;
  reset: () => void;
}

const QuestionMediaPickerContext =
  createContext<QuestionMediaPickerContextValue | null>(null);

/**
 * Provider holding the media picker state for the add-question form.
 * @param children - Form subtree that consumes the picker context.
 * @returns The provider element.
 */
export function QuestionMediaPickerProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(
    questionMediaPickerReducer,
    initialState,
  );

  /**
   * Validates and adds selected browser files to the picker. Each file is
   * checked in order (type, then size, then count) and either accepted with a
   * stable id or rejected. Valid files in a mixed batch are still added; the
   * inline error reflects the most recent rejection reason in the batch.
   * @param files - The browser File objects chosen by the admin.
   */
  function addFiles(files: File[]): void {
    const accepted: SelectedMediaFile[] = [];
    let error: string | null = null;

    for (const file of files) {
      if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
        error = "Unsupported media type";
        continue;
      }
      if (file.size > MAX_MEDIA_SIZE_BYTES) {
        error = "Each media file must be 10 MB or smaller";
        continue;
      }
      if (
        state.selectedFiles.length + accepted.length >=
        MAX_MEDIA_PER_QUESTION
      ) {
        error = "A question can have at most 3 media files";
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file });
    }

    if (accepted.length > 0) dispatch({ type: "ADD_FILES", files: accepted });
    dispatch({ type: "SET_ERROR", error });
  }

  /**
   * Uploads the selected files directly to S3: requests presigned slots, PUTs
   * each file to its slot with a matching content-type, and returns the ordered
   * media metadata to persist with the question. Throws if the slot request or
   * any upload fails (single error boundary for the submit path).
   * @returns The ordered media entries for the created question.
   */
  async function uploadSelectedFiles(): Promise<SubmittedMedia> {
    const files = state.selectedFiles.map(({ file }) => file);
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

  const value: QuestionMediaPickerContextValue = {
    ...state,
    addFiles,
    removeFile: (id) => dispatch({ type: "REMOVE_FILE", id }),
    uploadSelectedFiles,
    reset: () => dispatch({ type: "RESET" }),
  };

  return (
    <QuestionMediaPickerContext.Provider value={value}>
      {children}
    </QuestionMediaPickerContext.Provider>
  );
}

/**
 * Domain hook exposing the current picker state. Throws outside the provider.
 * @returns The current picker state.
 */
export function useQuestionMediaPickerState(): QuestionMediaPickerState {
  const value = useContext(QuestionMediaPickerContext);
  if (!value) {
    throw new Error(
      "useQuestionMediaPickerState must be used within QuestionMediaPickerProvider",
    );
  }
  return {
    selectedFiles: value.selectedFiles,
    validationError: value.validationError,
  };
}

/**
 * Domain hook exposing the picker actions. Throws outside the provider.
 * @returns The picker action callbacks.
 */
export function useQuestionMediaPickerActions(): {
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  uploadSelectedFiles: () => Promise<SubmittedMedia>;
  reset: () => void;
} {
  const value = useContext(QuestionMediaPickerContext);
  if (!value) {
    throw new Error(
      "useQuestionMediaPickerActions must be used within QuestionMediaPickerProvider",
    );
  }
  return {
    addFiles: value.addFiles,
    removeFile: value.removeFile,
    uploadSelectedFiles: value.uploadSelectedFiles,
    reset: value.reset,
  };
}
