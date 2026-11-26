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
 * Client display: one material table row with its size, upload date, a
 * Download link and a Remove button.
 * @param courseId - The course the material belongs to.
 * @param materialKey - The S3 key identifying the material.
 * @param fileName - The material's display file name.
 * @param url - The presigned download URL (empty if not yet minted).
 * @param size - The size, already formatted on the server.
 * @param uploaded - The upload date, already formatted on the server.
 * @returns The material row element.
 */
export function MaterialRow({
  courseId,
  materialKey,
  fileName,
  url,
  size,
  uploaded,
}: {
  courseId: string;
  materialKey: string;
  fileName: string;
  url: string;
  size: string;
  uploaded: string;
}): React.ReactNode {
  const [isPending, startTransition] = useTransition();

  return (
    <tr className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b px-4 py-3 last:border-b-0 hover:bg-muted/30 md:table-row md:p-0">
      <td className="block min-w-0 basis-full font-semibold md:table-cell md:w-full md:min-w-40 md:max-w-0 md:px-4 md:py-3">
        <span className="block truncate">{fileName}</span>
      </td>
      <td className="block whitespace-nowrap text-muted-foreground md:table-cell md:px-4 md:py-3 md:text-foreground">
        {size}
      </td>
      {/* The separator is CSS so the cell's text stays the bare date. */}
      <td className="block whitespace-nowrap text-muted-foreground max-md:before:mr-1.5 max-md:before:content-['·'] md:table-cell md:px-4 md:py-3 md:text-foreground">
        {uploaded}
      </td>
      <td className="block basis-full pt-1.5 md:table-cell md:px-4 md:py-3">
        <div className="flex gap-2 md:justify-end">
          {url && (
            // The visible name stays "Download"; the label keeps the file name reachable by assistive tech.
            <Button asChild variant="outline" size="sm">
              <a href={url} aria-label={`Download ${fileName}`}>
                Download
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive"
            disabled={isPending}
            aria-label={`Remove ${fileName}`}
            onClick={() =>
              startTransition(async () => {
                await removeCourseMaterialAction(courseId, materialKey);
              })
            }
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}
