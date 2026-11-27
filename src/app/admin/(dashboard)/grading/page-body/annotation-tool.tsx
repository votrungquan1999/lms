"use client";

import { useState } from "react";
import {
  AnnotationOverlay,
  TEXT_MARK_FONT_SIZE,
  textMarkPlacement,
} from "src/components/annotation-overlay";
import { Button } from "src/components/ui/button";
import {
  ANNOTATION_PALETTE,
  ANNOTATION_TEXT_MAX_LENGTH,
} from "src/lib/annotation-service";
import { MarkTool, useAnnotationTool } from "./annotation-tool.state";

/** Photo (key + presigned url) a grader can annotate. */
export interface AnnotatablePhoto {
  key: string;
  url: string;
}

const TOOLS: { tool: MarkTool; label: string }[] = [
  { tool: MarkTool.Pen, label: "Pen" },
  { tool: MarkTool.Circle, label: "Circle" },
  { tool: MarkTool.Arrow, label: "Arrow" },
  { tool: MarkTool.Text, label: "Text" },
  { tool: MarkTool.Move, label: "Move" },
];

/**
 * Grader marking tool: shows one answer photo at a time with a thumbnail strip,
 * marks it with pen, circle, arrow or typed text, and undoes or clears the shown
 * photo's marks. The marks live in the surrounding tool provider and are saved
 * by the grade panel's Save & next.
 * @param photos - The student's answer photos (key + presigned url).
 * @returns The annotation tool element.
 */
export function AnnotationTool({
  photos,
}: {
  photos: AnnotatablePhoto[];
}): React.ReactNode {
  const {
    color,
    tool,
    entriesByKey,
    textsByKey,
    textDraft,
    drawing,
    dispatch,
  } = useAnnotationTool();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [fit, setFit] = useState(true);

  /** Rendered size of the drawing surface in pixels. */
  function toSize(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /** Converts a pointer event into a normalized (0..1) point on the surface. */
  function toPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {TOOLS.map((option) => (
          <Button
            key={option.tool}
            type="button"
            variant={tool === option.tool ? "default" : "outline"}
            size="sm"
            aria-pressed={tool === option.tool}
            onClick={() => dispatch({ type: "SET_TOOL", tool: option.tool })}
          >
            {option.label}
          </Button>
        ))}
        {ANNOTATION_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Draw in ${c}`}
            aria-pressed={color === c}
            onClick={() => dispatch({ type: "SET_COLOR", color: c })}
            style={{ backgroundColor: c }}
            className={`size-6 rounded-full border ${
              color === c ? "ring-2 ring-offset-1 ring-ring" : ""
            }`}
          />
        ))}
      </div>

      {(() => {
        const photo = photos[photoIndex] ?? photos[0];
        const committed = entriesByKey[photo.key] ?? [];
        const live =
          drawing && drawing.mediaKey === photo.key ? [drawing.stroke] : [];
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {photos.length === 1 ? "1 photo" : `${photos.length} photos`} ·
                showing photo {photoIndex + 1}
              </p>
              <div className="flex gap-1">
                {[
                  { label: "Fit", value: true },
                  { label: "100%", value: false },
                ].map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    variant={fit === option.value ? "default" : "outline"}
                    size="sm"
                    aria-pressed={fit === option.value}
                    onClick={() => setFit(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className={fit ? undefined : "max-h-[70vh] overflow-auto"}>
              <AnnotationOverlay
                src={photo.url}
                alt="Student submitted work"
                strokes={[...committed, ...live]}
                texts={textsByKey[photo.key] ?? []}
                fit={fit}
              >
                <svg
                  aria-label="Drawing surface"
                  className={`col-start-1 row-start-1 size-full [contain:size] ${
                    tool === MarkTool.Move
                      ? "cursor-grab touch-pan-x touch-pan-y"
                      : "cursor-crosshair touch-none"
                  }`}
                  onPointerDown={(e) => {
                    // Move leaves the drag to the browser, which pans or scrolls on touch
                    if (tool === MarkTool.Text || tool === MarkTool.Move)
                      return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dispatch({
                      type: "START_STROKE",
                      mediaKey: photo.key,
                      point: toPoint(e),
                      size: toSize(e),
                    });
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons !== 1) return;
                    dispatch({ type: "ADD_POINT", point: toPoint(e) });
                  }}
                  onPointerUp={(e) => {
                    // Opened on pointer up: an input opened on pointer down loses focus to the same click
                    if (tool === MarkTool.Move) return;
                    if (tool === MarkTool.Text) {
                      dispatch({
                        type: "START_TEXT",
                        mediaKey: photo.key,
                        point: toPoint(e),
                      });
                      return;
                    }
                    dispatch({ type: "END_STROKE" });
                  }}
                  onPointerCancel={() => dispatch({ type: "END_STROKE" })}
                >
                  <title>Drawing surface</title>
                </svg>
                {textDraft && textDraft.mediaKey === photo.key && (
                  <div className="pointer-events-none relative col-start-1 row-start-1 size-full overflow-hidden [contain:size] @container">
                    <input
                      // Focus without scrolling, or the clipped photo layers shift
                      ref={(el) => el?.focus({ preventScroll: true })}
                      aria-label="Text mark"
                      maxLength={ANNOTATION_TEXT_MAX_LENGTH}
                      value={textDraft.text}
                      onChange={(e) =>
                        dispatch({ type: "SET_TEXT", text: e.target.value })
                      }
                      onBlur={() => dispatch({ type: "COMMIT_TEXT" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          dispatch({ type: "COMMIT_TEXT" });
                        if (e.key === "Escape")
                          dispatch({ type: "CANCEL_TEXT" });
                      }}
                      className="pointer-events-auto absolute rounded border border-border bg-background/90 px-1 font-semibold leading-tight outline-none"
                      style={{
                        ...textMarkPlacement(textDraft.point),
                        width: textMarkPlacement(textDraft.point).maxWidth,
                        color: textDraft.color,
                        // iOS zooms the page when a focused field is under 16px
                        fontSize: `max(16px, ${TEXT_MARK_FONT_SIZE})`,
                      }}
                    />
                  </div>
                )}
              </AnnotationOverlay>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: "UNDO", mediaKey: photo.key })}
              >
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: "CLEAR", mediaKey: photo.key })}
              >
                Clear photo
              </Button>
            </div>

            <fieldset
              aria-label="Photos"
              className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
            >
              {photos.map((thumb, index) => {
                const marks =
                  (entriesByKey[thumb.key] ?? []).length +
                  (textsByKey[thumb.key] ?? []).length;
                const label = `Photo ${index + 1} · ${marks} ${marks === 1 ? "mark" : "marks"}`;
                return (
                  <button
                    key={thumb.key}
                    type="button"
                    aria-label={label}
                    aria-pressed={index === photoIndex}
                    onClick={() => setPhotoIndex(index)}
                    className={`w-24 space-y-1 rounded-md border p-1 text-left text-xs ${
                      index === photoIndex ? "ring-2 ring-ring" : ""
                    }`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: presigned S3 url */}
                    <img
                      src={thumb.url}
                      alt={`Preview ${index + 1}`}
                      className="h-14 w-full rounded object-cover"
                    />
                    <span className="block">{label}</span>
                  </button>
                );
              })}
            </fieldset>
            <p className="text-xs text-muted-foreground">
              Marks are saved with Save & next
            </p>
          </div>
        );
      })()}
    </div>
  );
}
