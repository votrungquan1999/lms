"use client";

import { useTransition } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { removeCourseMaterialAction } from "./material-actions";
import {
  useMaterialsPickerActions,
  useMaterialsPickerState,
} from "./materials-picker.state";

/**
 * Client upload control: a file picker, the list of pending files, an upload
 * button, and any validation/upload error. Drives the materials picker state.
 * @returns The upload control element.
 */
export function MaterialsUploadControl(): React.ReactNode {
  const { selectedFiles, validationError, isUploading } =
    useMaterialsPickerState();
  const { addFiles, removeFile, uploadSelectedFiles } =
    useMaterialsPickerActions();

  return (
    <div className="grid gap-2">
      <Label htmlFor="materials-file">Materials file</Label>
      <Input
        id="materials-file"
        type="file"
        multiple
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {selectedFiles.length > 0 && (
        <ul className="grid gap-1">
          {selectedFiles.map((selected) => (
            <li
              key={selected.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{selected.file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(selected.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {validationError && (
        <p className="text-sm text-destructive">{validationError}</p>
      )}

      <Button
        type="button"
        size="sm"
        disabled={selectedFiles.length === 0 || isUploading}
        onClick={() => uploadSelectedFiles()}
      >
        {isUploading ? "Uploading…" : "Upload materials"}
      </Button>
    </div>
  );
}

/**
 * Client display: one material row — a download link and a remove button.
 * @param courseId - The course the material belongs to.
 * @param materialKey - The S3 key identifying the material.
 * @param fileName - The material's display file name.
 * @param url - The presigned download URL (empty if not yet minted).
 * @returns The material row element.
 */
export function MaterialRow({
  courseId,
  materialKey,
  fileName,
  url,
}: {
  courseId: string;
  materialKey: string;
  fileName: string;
  url: string;
}): React.ReactNode {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
      {url ? (
        <a href={url} className="text-sm font-medium hover:underline">
          {fileName}
        </a>
      ) : (
        <span className="text-sm font-medium">{fileName}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await removeCourseMaterialAction(courseId, materialKey);
          })
        }
      >
        Remove
      </Button>
    </div>
  );
}
