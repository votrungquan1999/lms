"use client";

import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { MAX_MEDIA_PER_QUESTION } from "../question-media.schema";
import type {
  ImportQuestionDraft,
  ReviewPicture,
} from "./import-ai-form.state";
import { picturesOf, useImportAi } from "./import-ai-form.state";

/**
 * The document pictures the AI matched to one question, so the teacher can
 * check them before import and remove a wrong one. A number with no picture
 * behind it is skipped.
 */
export function QuestionPictures({
  question,
  firstQuestionNumber,
}: {
  question: ImportQuestionDraft;
  firstQuestionNumber: number;
}): React.ReactNode {
  const { pictures, questions, removePicture, movePicture, isBusy } =
    useImportAi();
  const shown = picturesOf(question, pictures);
  if (shown.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {shown.map((picture, index) => {
        const targets = moveTargets(question, picture, questions, pictures);
        return (
          <div key={picture.number} className="grid gap-1">
            {/* A local blob preview — next/image can't optimize it. */}
            {/* biome-ignore lint/performance/noImgElement: local blob preview url */}
            <img
              src={picture.previewUrl}
              alt={`Figure ${picture.number}`}
              className="max-h-48 w-full rounded-md border border-border object-contain"
            />
            {/* The name students see under this picture, which "Picture k" in the text refers to. */}
            <p className="text-sm text-muted-foreground">Picture {index + 1}</p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label={`Remove picture ${picture.number}`}
              disabled={isBusy}
              onClick={() => removePicture(question.id, picture.number)}
            >
              Remove
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Move picture ${picture.number} to another question`}
                  disabled={isBusy || targets.every((t) => t.unavailable)}
                >
                  Move to question…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-auto max-w-xs min-w-48">
                {targets.map(({ target, index, unavailable }) => (
                  <DropdownMenuItem
                    key={target.id}
                    disabled={unavailable !== null}
                    onSelect={() =>
                      movePicture(picture.number, question.id, target.id)
                    }
                  >
                    #{firstQuestionNumber + index}
                    {target.title.trim() && ` ${target.title.trim()}`}
                    {unavailable && ` — ${unavailable}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Every question except the picture's own, with why it cannot take the picture if it cannot.
 * @param owner - The question the picture is on.
 * @param picture - The picture to move.
 * @param drafts - The drafts as listed now.
 * @param pictures - Every picture the document had.
 * @returns One entry per other question, with its position in the list.
 */
function moveTargets(
  owner: ImportQuestionDraft,
  picture: ReviewPicture,
  drafts: ImportQuestionDraft[],
  pictures: ReviewPicture[],
): {
  target: ImportQuestionDraft;
  index: number;
  unavailable: string | null;
}[] {
  return drafts.flatMap((target, index) => {
    if (target.id === owner.id) return [];
    // Counts the pictures the card shows, as the Unused area does.
    const unavailable = target.imageNumbers?.includes(picture.number)
      ? "already has this picture"
      : picturesOf(target, pictures).length >= MAX_MEDIA_PER_QUESTION
        ? "full"
        : null;
    return [{ target, index, unavailable }];
  });
}
