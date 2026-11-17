"use client";

import { useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { MAX_MEDIA_PER_QUESTION } from "src/lib/question-media-merge";
import { MAX_MEDIA_SIZE_BYTES } from "../question-media.schema";
import { picturesOf, useImportAi } from "./import-ai-form.state";
import {
  useQuestionEditActions,
  useQuestionEditState,
} from "./question-edit.state";

/** Picture types the import accepts; videos are not part of an AI import. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * The draft's pictures inside the Edit modal, with Remove and an image-only
 * picker. Nothing is stored until Save, and nothing is uploaded until Import.
 * @param questionId - The draft being edited.
 */
export function QuestionEditPictures({
  questionId,
}: {
  questionId: string;
}): React.ReactNode {
  const draft = useQuestionEditState();
  const { pictures, questions } = useImportAi();
  const { addPicture, removePicture } = useQuestionEditActions();
  const [error, setError] = useState<string | null>(null);
  // Highest number handed out in this modal, so a removed file's number is never reused.
  const issuedRef = useRef(0);

  const shown = picturesOf(draft, [...pictures, ...draft.addedPictures]);
  const isFull = shown.length >= MAX_MEDIA_PER_QUESTION;
  const pickerId = `edit-question-picture-file-${questionId}`;

  /** The next free number: Undo never frees one, so it counts every picture and every draft's claim. */
  function nextNumber(): number {
    const taken = [
      ...pictures.map((picture) => picture.number),
      ...questions.flatMap((question) => question.imageNumbers ?? []),
      ...draft.imageNumbers,
    ];
    return Math.max(issuedRef.current, ...taken) + 1;
  }

  /** Validates a picked file and adds it as the next review picture. */
  function pick(file: File): void {
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Only PNG, JPEG or WebP pictures can be added");
      return;
    }
    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setError("Each picture must be 10 MB or smaller");
      return;
    }
    setError(null);
    const number = nextNumber();
    issuedRef.current = number;
    addPicture({
      number,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  /** Drops a picture from the question; a file picked in this session also frees its preview. */
  function remove(number: number): void {
    const picked = draft.addedPictures.find(
      (picture) => picture.number === number,
    );
    if (picked) URL.revokeObjectURL(picked.previewUrl);
    removePicture(number);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={pickerId}>Add a picture file</Label>
      <Input
        id={pickerId}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        disabled={isFull}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so the same file can be picked again after Remove.
          e.target.value = "";
          if (file) pick(file);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((picture, index) => (
          <div key={picture.number} className="grid gap-1">
            {/* A local blob preview — next/image can't optimize it. */}
            {/* biome-ignore lint/performance/noImgElement: local blob preview url */}
            <img
              src={picture.previewUrl}
              alt={`Figure ${picture.number} in the edit`}
              className="max-h-32 w-full rounded-md border border-border object-contain"
            />
            <p className="text-sm text-muted-foreground">Picture {index + 1}</p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label={`Remove picture ${picture.number} from this question`}
              onClick={() => remove(picture.number)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
