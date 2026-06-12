"use client";

import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import {
  useQuestionMediaPickerActions,
  useQuestionMediaPickerState,
} from "./question-media-picker.state";

/**
 * Left sidebar that lists selectable question types and highlights the active
 * one. Display-only — selection state is owned by the parent form.
 * @param options - Ordered [value, label] pairs to render as buttons.
 * @param value - The currently selected question-type value.
 * @param onSelect - Called with a type value when its button is clicked.
 * @returns The type-picker sidebar element.
 */
export function QuestionTypeSidebar<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: [T, string][];
  value: T;
  onSelect: (value: T) => void;
}): React.ReactNode {
  return (
    <aside className="w-40 shrink-0 border-r bg-muted/40 flex flex-col">
      {options.map(([type, label]) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type)}
          className={[
            "px-4 py-3 text-left text-sm font-medium transition-colors",
            "border-b last:border-b-0",
            value === type
              ? "bg-background text-primary border-l-2 border-l-primary pl-[14px]"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </aside>
  );
}

/**
 * File input for selecting question media. Selecting files adds them to the
 * picker; the input is reset so the same file can be re-selected after removal.
 * @returns The media file input element.
 */
export function QuestionMediaFileInput(): React.ReactNode {
  const { addFiles } = useQuestionMediaPickerActions();
  const { validationError } = useQuestionMediaPickerState();

  return (
    <div className="space-y-2">
      <Label htmlFor="media-files">Media Files</Label>
      <Input
        id="media-files"
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) addFiles(files);
          // Reset so re-selecting the same file fires onChange again.
          e.target.value = "";
        }}
      />
      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}
    </div>
  );
}

/**
 * Lists the currently selected media files, each with a remove control.
 * Renders nothing when no files are selected.
 * @returns The selected-file list, or null when empty.
 */
export function QuestionMediaFileList(): React.ReactNode {
  const { selectedFiles } = useQuestionMediaPickerState();
  const { removeFile } = useQuestionMediaPickerActions();

  if (selectedFiles.length === 0) return null;

  return (
    <ul className="space-y-1" aria-label="Selected media files">
      {selectedFiles.map(({ id, file }) => (
        <li key={id} className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeFile(id)}
            aria-label={`Remove ${file.name}`}
            className="px-2 text-destructive hover:text-destructive"
          >
            ✕
          </Button>
        </li>
      ))}
    </ul>
  );
}
