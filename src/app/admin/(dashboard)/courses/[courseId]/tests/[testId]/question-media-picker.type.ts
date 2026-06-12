/** Client-only view model for a file the admin has selected in the media picker. */
export interface SelectedMediaFile {
  /** Stable client-side id — assigned via crypto.randomUUID() at selection time. */
  id: string;
  file: File;
}

/** Full client state for the question media picker. */
export interface QuestionMediaPickerState {
  selectedFiles: SelectedMediaFile[];
  /** Inline validation message for the most recent rejected selection, or null. */
  validationError: string | null;
}

/** Reducer actions for the question media picker. */
export type QuestionMediaPickerAction =
  | { type: "ADD_FILES"; files: SelectedMediaFile[] }
  | { type: "REMOVE_FILE"; id: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET" };
