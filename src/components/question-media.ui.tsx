"use client";

import type { QuestionMedia as QuestionMediaItem } from "src/lib/question-service";

/**
 * Renders a question's media attachments — images as `<img>`, videos as
 * `<video controls>` — in the teacher's order. Renders nothing when empty.
 * @param media - The question's ordered media entries (each with a presigned url).
 */
export function QuestionMedia({ media }: { media: QuestionMediaItem[] }) {
  if (media.length === 0) {
    return null;
  }

  const ordered = [...media].sort((a, b) => a.order - b.order);

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
          // Presigned S3 URLs are short-lived/dynamic — next/image optimization
          // can't proxy them, so a plain <img> is intentional here.
          // biome-ignore lint/performance/noImgElement: presigned S3 media url
          <img
            key={entry.key}
            src={entry.url}
            alt={`Question media ${entry.order + 1}`}
            className="w-full max-w-2xl rounded-md border border-border"
          />
        ),
      )}
    </div>
  );
}
