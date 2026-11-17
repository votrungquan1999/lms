"use client";

import { Button } from "src/components/ui/button";
import type { QuestionMedia } from "src/lib/question-service";

interface KeptMediaListProps {
  /** The question's current pictures and videos, in saved order. */
  media: QuestionMedia[];
  /** Each picture's number when the modal opened; keeps `[image N]` stable while pictures are removed. */
  numbers: ReadonlyMap<string, number>;
  /** Called with the key of the entry the teacher removes. */
  onRemove: (key: string) => void;
}

/**
 * Lists a question's current pictures and videos, each with a Remove control.
 * Pictures keep the number they had when the modal opened, the one a teacher
 * types as `[image N]`.
 * @param props - The current media and the remove callback.
 * @returns The list, or null when the question has no media.
 */
export function KeptMediaList({
  media,
  numbers,
  onRemove,
}: KeptMediaListProps): React.ReactNode {
  if (media.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Current pictures and videos">
      {media.map((entry) => {
        const isVideo = entry.contentType.startsWith("video/");
        const pictureNumber = numbers.get(entry.key);
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
            <span className="flex-1 text-sm">
              <span className="capitalize">{label}</span>
              {!isVideo && (
                <span className="text-muted-foreground">
                  {" "}
                  (type [image {pictureNumber}] in the text)
                </span>
              )}
            </span>
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
