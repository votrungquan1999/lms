"use client";

import type { QuestionMedia as QuestionMediaItem } from "src/lib/question-service";

/**
 * Renders a question's media attachments — images as `<img>` captioned
 * "Picture k", videos as `<video controls>` — in the teacher's order.
 * Renders nothing when empty.
 * @param media - The question's ordered media entries (each with a presigned url).
 */
export function QuestionMedia({ media }: { media: QuestionMediaItem[] }) {
  if (media.length === 0) {
    return null;
  }

  const ordered = [...media].sort((a, b) => a.order - b.order);
  // Question text names pictures by this number, so videos do not count.
  const pictureNumbers = new Map(
    ordered
      .filter((entry) => !entry.contentType.startsWith("video/"))
      .map((entry, index) => [entry.key, index + 1]),
  );

  return (
    <div className="grid gap-3">
      {ordered.map((entry) =>
        entry.contentType.startsWith("video/") ? (
          <video
            key={entry.key}
            controls
            src={entry.url}
            className="w-full max-w-2xl rounded-md border border-border"
          >
            <track kind="captions" />
          </video>
        ) : (
          <figure key={entry.key} className="grid gap-1">
            {/* Presigned S3 URLs are short-lived/dynamic — next/image optimization can't proxy them. */}
            {/* biome-ignore lint/performance/noImgElement: presigned S3 media url */}
            <img
              src={entry.url}
              // biome-ignore lint/a11y/noRedundantAlt: the name question text uses for this picture
              alt={`Picture ${pictureNumbers.get(entry.key)}`}
              className="w-full max-w-2xl rounded-md border border-border"
            />
            <figcaption className="text-sm text-muted-foreground">
              Picture {pictureNumbers.get(entry.key)}
            </figcaption>
          </figure>
        ),
      )}
    </div>
  );
}
