"use client";

import { Button } from "src/components/ui/button";
import type { QuestionMedia } from "src/lib/question-service";

interface KeptMediaListProps {
  /** The question's current pictures and videos, in saved order. */
  media: QuestionMedia[];
  /** Called with the key of the entry the teacher removes. */
  onRemove: (key: string) => void;
}

/**
 * Lists a question's current pictures and videos, each with a Remove control.
 * Pictures are numbered by position among pictures, as the preview names them.
 * @param props - The current media and the remove callback.
 * @returns The list, or null when the question has no media.
 */
export function KeptMediaList({
  media,
  onRemove,
}: KeptMediaListProps): React.ReactNode {
  if (media.length === 0) return null;

  let pictureNumber = 0;
  return (
    <ul className="space-y-2" aria-label="Current pictures and videos">
      {media.map((entry) => {
        const isVideo = entry.contentType.startsWith("video/");
        if (!isVideo) pictureNumber += 1;
        const label = isVideo ? "video" : `picture ${pictureNumber}`;
        return (
          <li key={entry.key} className="flex items-center gap-2">
            {isVideo ? (
              <video
                src={entry.url}
                className="h-16 rounded border border-border"
              >
                <track kind="captions" />
              </video>
            ) : (
              // biome-ignore lint/performance/noImgElement: presigned S3 media url
              <img
                src={entry.url}
                alt=""
                className="h-16 rounded border border-border"
              />
            )}
            <span className="flex-1 text-sm capitalize">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(entry.key)}
              aria-label={`Remove ${label}`}
              className="px-2 text-destructive hover:text-destructive"
            >
              ✕
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
