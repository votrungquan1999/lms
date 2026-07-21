"use client";

import { createContext, useContext, useReducer } from "react";
import {
  addCourseMaterialAction,
  requestMaterialUploadSlotsAction,
} from "./material-actions";
import {
  MAX_MATERIAL_SIZE_BYTES,
  MaterialContentType,
} from "./material-upload.schema";

const ALLOWED_CONTENT_TYPES = Object.values(MaterialContentType) as string[];

interface SelectedMaterialFile {
  id: string;
  file: File;
}

interface MaterialsPickerState {
  selectedFiles: SelectedMaterialFile[];
  validationError: string | null;
  isUploading: boolean;
}

interface AddFilesAction {
  type: "ADD_FILES";
  files: SelectedMaterialFile[];
}
interface RemoveFileAction {
  type: "REMOVE_FILE";
  id: string;
}
interface SetErrorAction {
  type: "SET_ERROR";
  error: string | null;
}
interface SetUploadingAction {
  type: "SET_UPLOADING";
  isUploading: boolean;
}
interface ResetAction {
  type: "RESET";
}

type MaterialsPickerAction =
  | AddFilesAction
  | RemoveFileAction
  | SetErrorAction
  | SetUploadingAction
  | ResetAction;

const initialState: MaterialsPickerState = {
  selectedFiles: [],
  validationError: null,
  isUploading: false,
};

/**
 * Reducer for the course-materials picker.
 * @param state - Current picker state.
 * @param action - Action to apply.
 * @returns The next picker state.
 */
function materialsPickerReducer(
  state: MaterialsPickerState,
  action: MaterialsPickerAction,
): MaterialsPickerState {
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
    case "SET_UPLOADING":
      return { ...state, isUploading: action.isUploading };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface MaterialsPickerContextValue extends MaterialsPickerState {
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  uploadSelectedFiles: () => Promise<void>;
}

const MaterialsPickerContext =
  createContext<MaterialsPickerContextValue | null>(null);

/**
 * Provider holding the course-materials picker state and upload flow.
 * @param courseId - The course materials are uploaded to.
 * @param children - Subtree consuming the picker context.
 * @returns The provider element.
 */
export function MaterialsPickerProvider({
  courseId,
  children,
}: {
  courseId: string;
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(materialsPickerReducer, initialState);

  /**
   * Validates and adds selected browser files (type, then size) to the picker.
   * @param files - The browser File objects chosen by the instructor.
   */
  function addFiles(files: File[]): void {
    const accepted: SelectedMaterialFile[] = [];
    let error: string | null = null;

    for (const file of files) {
      if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
        error = "Unsupported file type";
        continue;
      }
      if (file.size > MAX_MATERIAL_SIZE_BYTES) {
        error = "Each file must be 10 MB or smaller";
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file });
    }

    if (accepted.length > 0) dispatch({ type: "ADD_FILES", files: accepted });
    dispatch({ type: "SET_ERROR", error });
  }

  /**
   * Uploads the selected files directly to S3 (presigned PUT) then persists each
   * material's metadata against the course. Throws if any step fails (single
   * error boundary for the upload path).
   */
  async function uploadSelectedFiles(): Promise<void> {
    const files = state.selectedFiles.map(({ file }) => file);
    if (files.length === 0) return;

    dispatch({ type: "SET_UPLOADING", isUploading: true });
    try {
      const slotResult = await requestMaterialUploadSlotsAction(
        courseId,
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

      for (const slot of slots) {
        const persisted = await addCourseMaterialAction(courseId, {
          key: slot.key,
          contentType: slot.contentType as MaterialContentType,
          fileName: slot.fileName,
          size: slot.size,
        });
        if (!persisted.success) throw new Error(persisted.message);
      }

      dispatch({ type: "RESET" });
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      dispatch({ type: "SET_UPLOADING", isUploading: false });
    }
  }

  const value: MaterialsPickerContextValue = {
    ...state,
    addFiles,
    removeFile: (id) => dispatch({ type: "REMOVE_FILE", id }),
    uploadSelectedFiles,
  };

  return (
    <MaterialsPickerContext.Provider value={value}>
      {children}
    </MaterialsPickerContext.Provider>
  );
}

/**
 * Domain hook exposing the materials picker state. Throws outside the provider.
 * @returns The current picker state.
 */
export function useMaterialsPickerState(): MaterialsPickerState {
  const value = useContext(MaterialsPickerContext);
  if (!value) {
    throw new Error(
      "useMaterialsPickerState must be used within MaterialsPickerProvider",
    );
  }
  return {
    selectedFiles: value.selectedFiles,
    validationError: value.validationError,
    isUploading: value.isUploading,
  };
}

/**
 * Domain hook exposing the materials picker actions. Throws outside provider.
 * @returns The picker action callbacks.
 */
export function useMaterialsPickerActions(): {
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  uploadSelectedFiles: () => Promise<void>;
} {
  const value = useContext(MaterialsPickerContext);
  if (!value) {
    throw new Error(
      "useMaterialsPickerActions must be used within MaterialsPickerProvider",
    );
  }
  return {
    addFiles: value.addFiles,
    removeFile: value.removeFile,
    uploadSelectedFiles: value.uploadSelectedFiles,
  };
}
