"use client";

import { useState } from "react";
import { Button } from "src/components/ui/button";
import { MAX_MEDIA_PER_QUESTION } from "../question-media.schema";
import type { ReviewPicture } from "./import-ai-form.state";
import { picturesOf, useImportAi } from "./import-ai-form.state";

/**
 * The document pictures no question uses yet, shown above the review list so
 * the teacher can see what the AI left out. Derived from the drafts on every
 * render, so a picture removed from a question shows up here again.
 */
export function UnusedPictures({
  firstQuestionNumber,
}: {
  /** Number the first draft will have once saved. */
  firstQuestionNumber: number;
}): React.ReactNode {
  const { pictures, questions } = useImportAi();
  const used = new Set(questions.flatMap((q) => q.imageNumbers ?? []));
  // Walks the document's pictures, so a number with no picture behind it never makes a tile.
  const unused = pictures.filter((picture) => !used.has(picture.number));
  if (unused.length === 0) return null;

  return (
    <section aria-labelledby="unused-pictures-heading" className="space-y-2">
      <h3 id="unused-pictures-heading" className="text-sm font-semibold">
        Unused pictures
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {unused.map((picture) => (
          <div key={picture.number} className="grid gap-1">
            {/* A local blob preview — next/image can't optimize it. */}
            {/* biome-ignore lint/performance/noImgElement: local blob preview url */}
            <img
              src={picture.previewUrl}
              // biome-ignore lint/a11y/noRedundantAlt: tells it apart from the cards' "Figure N"
              alt={`Unused picture ${picture.number}`}
              className="max-h-48 w-full rounded-md border border-border object-contain"
            />
            <AddPictureControl
              picture={picture}
              firstQuestionNumber={firstQuestionNumber}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Picks the question an unused picture should join and adds it there.
 * @param picture - The unused picture.
 * @param firstQuestionNumber - Number the first draft will have once saved.
 */
function AddPictureControl({
  picture,
  firstQuestionNumber,
}: {
  picture: ReviewPicture;
  firstQuestionNumber: number;
}): React.ReactNode {
  const { questions, pictures, addPicture, isBusy } = useImportAi();
  const [questionId, setQuestionId] = useState("");
  const target = questions.find((question) => question.id === questionId);
  // Counts the pictures the card actually shows, not numbers with no picture behind them.
  const targetIsFull =
    target !== undefined &&
    picturesOf(target, pictures).length >= MAX_MEDIA_PER_QUESTION;
  const reasonId = `add-picture-${picture.number}-reason`;

  return (
    <div className="grid gap-1">
      <div className="flex gap-2">
        <select
          aria-label={`Question for picture ${picture.number}`}
          value={questionId}
          onChange={(event) => setQuestionId(event.target.value)}
          aria-describedby={targetIsFull ? reasonId : undefined}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">Choose a question</option>
          {questions.map((question, index) => (
            <option key={question.id} value={question.id}>
              #{firstQuestionNumber + index} {question.title}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          aria-label={`Add picture ${picture.number}`}
          // Locked while a read or import runs: an import uploads these pictures, and a read replaces the list.
          disabled={!target || targetIsFull || isBusy}
          aria-describedby={targetIsFull ? reasonId : undefined}
          onClick={() => {
            if (!target) return;
            addPicture(target.id, picture.number);
          }}
        >
          Add
        </Button>
      </div>
      {targetIsFull && (
        <p id={reasonId} className="text-xs text-muted-foreground">
          A question can have at most {MAX_MEDIA_PER_QUESTION} pictures.
        </p>
      )}
    </div>
  );
}
