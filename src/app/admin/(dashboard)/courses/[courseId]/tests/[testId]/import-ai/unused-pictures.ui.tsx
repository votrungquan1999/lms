"use client";

import { useImportAi } from "./import-ai-form.state";

/**
 * The document pictures no question uses yet, shown above the review list so
 * the teacher can see what the AI left out. Derived from the drafts on every
 * render, so a picture removed from a question shows up here again.
 */
export function UnusedPictures(): React.ReactNode {
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
          </div>
        ))}
      </div>
    </section>
  );
}
