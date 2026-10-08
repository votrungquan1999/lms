"use client";

import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import type { McOption } from "src/lib/question-service";

/**
 * Radio (single answer) or checkbox (several answers) list for a multiple
 * choice question. Controlled: the caller owns the selection.
 * @param questionId - The question these options belong to.
 * @param type - Whether one or several options may be picked.
 * @param options - The choices, in display order.
 * @param selectedIds - Ids of the currently picked options.
 * @param onChange - Called with the full next selection.
 */
export function McAnswerControls({
  questionId,
  type,
  options,
  selectedIds,
  onChange,
}: {
  questionId: string;
  type: "single_select" | "multi_select";
  options: McOption[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const checked = selectedIds.includes(opt.id);
        return (
          <label
            key={opt.id}
            htmlFor={`opt-${opt.id}`}
            className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input
              id={`opt-${opt.id}`}
              type={type === "single_select" ? "radio" : "checkbox"}
              // A per-question group name: without a surrounding form, a shared
              // name would make every question's radios one native group.
              name={`mc-option-${questionId}`}
              checked={checked}
              onChange={() => {
                if (type === "single_select") {
                  onChange([opt.id]);
                } else {
                  onChange(
                    checked
                      ? selectedIds.filter((id) => id !== opt.id)
                      : [...selectedIds, opt.id],
                  );
                }
              }}
              className="shrink-0"
            />
            <span className="text-sm min-w-0 wrap-anywhere">{opt.text}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Free-text answer box, named `answer` so a surrounding form can submit it.
 * Controlled when `value` is given, so a refused submit can't revert it
 * (React 19 resets uncontrolled fields); otherwise it starts from `defaultValue`.
 * @param value - The current text, when the caller owns it.
 * @param onChange - Called with the next text, when the caller owns it.
 * @param defaultValue - Text to start with, when uncontrolled.
 */
export function FreeTextAnswerControl({
  value,
  onChange,
  defaultValue,
}: {
  value?: string;
  onChange?: (nextText: string) => void;
  defaultValue?: string;
}) {
  return (
    <Textarea
      name="answer"
      placeholder="Type your answer here..."
      value={value}
      onChange={onChange && ((event) => onChange(event.target.value))}
      defaultValue={value === undefined ? defaultValue : undefined}
      rows={5}
      className="resize-y"
    />
  );
}

/** A photo the student picked, identified so it can be removed again. */
export interface PickedPhoto {
  id: string;
  name: string;
}

/**
 * Photo picker for an image-answer question. Controlled: the caller owns the
 * picked files and any validation message.
 * @param questionId - Scopes the input id so several photo questions can share a page.
 * @param photos - The photos picked so far.
 * @param error - Validation message to show, if any.
 * @param onAddFiles - Called with the files the student just chose.
 * @param onRemoveFile - Called with the id of the photo to drop.
 */
export function ImageAnswerControl({
  questionId,
  photos,
  error,
  onAddFiles,
  onRemoveFile,
}: {
  questionId: string;
  photos: PickedPhoto[];
  error: string | null;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
}) {
  const inputId = `answer-photos-${questionId}`;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        Your photos
      </label>
      <Input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => {
          onAddFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {photos.length > 0 && (
        <ul className="grid gap-1" aria-label="Selected photos">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{photo.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${photo.name}`}
                onClick={() => onRemoveFile(photo.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
