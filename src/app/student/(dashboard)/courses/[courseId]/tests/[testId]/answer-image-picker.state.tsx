"use client";

import { createContext, useContext, useReducer } from "react";
import { requestAnswerImageUploadSlotsAction } from "./answer-image-actions";
import {
  AnswerImageContentType,
  MAX_ANSWER_IMAGE_SIZE_BYTES,
  MAX_ANSWER_IMAGES,
} from "./answer-image-upload.schema";

const ALLOWED_CONTENT_TYPES = Object.values(AnswerImageContentType) as string[];

interface SelectedAnswerImage {
  id: string;
  file: File;
}

interface AnswerImagePickerState {
  selectedFiles: SelectedAnswerImage[];
  validationError: string | null;
}

interface AddFilesAction {
  type: "ADD_FILES";
  files: SelectedAnswerImage[];
}
interface RemoveFileAction {
  type: "REMOVE_FILE";
  id: string;
}
interface SetErrorAction {
  type: "SET_ERROR";
  error: string | null;
}
interface ResetAction {
  type: "RESET";
}

type AnswerImagePickerAction =
  | AddFilesAction
  | RemoveFileAction
  | SetErrorAction
  | ResetAction;

const initialState: AnswerImagePickerState = {
  selectedFiles: [],
  validationError: null,
};

/**
 * Reducer for the answer-image picker.
 * @param state - Current picker state.
 * @param action - Action to apply.
 * @returns The next picker state.
 */
function answerImagePickerReducer(
  state: AnswerImagePickerState,
  action: AnswerImagePickerAction,
): AnswerImagePickerState {
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

interface AnswerImagePickerContextValue extends AnswerImagePickerState {
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  uploadSelectedFiles: () => Promise<string[]>;
}

const AnswerImagePickerContext =
  createContext<AnswerImagePickerContextValue | null>(null);

/**
 * Provider holding the answer-image picker state and upload flow for a student
 * answering an image-answer question.
 * @param children - Subtree consuming the picker context.
 * @returns The provider element.
 */
export function AnswerImagePickerProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(answerImagePickerReducer, initialState);

  /**
   * Validates and adds chosen browser files (type, size, count) to the picker.
   * @param files - The browser File objects chosen by the student.
   */
  function addFiles(files: File[]): void {
    const accepted: SelectedAnswerImage[] = [];
    let error: string | null = null;

    for (const file of files) {
      if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
        error = "Unsupported image type";
        continue;
      }
      if (file.size > MAX_ANSWER_IMAGE_SIZE_BYTES) {
        error = "Each photo must be 10 MB or smaller";
        continue;
      }
      if (state.selectedFiles.length + accepted.length >= MAX_ANSWER_IMAGES) {
        error = "You can attach at most 3 photos";
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file });
    }

    if (accepted.length > 0) dispatch({ type: "ADD_FILES", files: accepted });
    dispatch({ type: "SET_ERROR", error });
  }

  /**
   * Uploads the selected photos directly to S3 (presigned PUT) and returns the
   * ordered S3 keys to persist with the answer. Throws if any step fails.
   * @returns The ordered S3 keys of the uploaded photos.
   */
  async function uploadSelectedFiles(): Promise<string[]> {
    const files = state.selectedFiles.map(({ file }) => file);
    if (files.length === 0) return [];

    const slotResult = await requestAnswerImageUploadSlotsAction(
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

    return slots.map((slot) => slot.key);
  }

  const value: AnswerImagePickerContextValue = {
    ...state,
    addFiles,
    removeFile: (id) => dispatch({ type: "REMOVE_FILE", id }),
    uploadSelectedFiles,
  };

  return (
    <AnswerImagePickerContext.Provider value={value}>
      {children}
    </AnswerImagePickerContext.Provider>
  );
}

/**
 * Domain hook exposing the answer-image picker state. Throws outside provider.
 * @returns The current picker state.
 */
export function useAnswerImagePickerState(): AnswerImagePickerState {
  const value = useContext(AnswerImagePickerContext);
  if (!value) {
    throw new Error(
      "useAnswerImagePickerState must be used within AnswerImagePickerProvider",
    );
  }
  return {
    selectedFiles: value.selectedFiles,
    validationError: value.validationError,
  };
}

/**
 * Domain hook exposing the answer-image picker actions. Throws outside provider.
 * @returns The picker action callbacks.
 */
export function useAnswerImagePickerActions(): {
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  uploadSelectedFiles: () => Promise<string[]>;
} {
  const value = useContext(AnswerImagePickerContext);
  if (!value) {
    throw new Error(
      "useAnswerImagePickerActions must be used within AnswerImagePickerProvider",
    );
  }
  return {
    addFiles: value.addFiles,
    removeFile: value.removeFile,
    uploadSelectedFiles: value.uploadSelectedFiles,
  };
}
