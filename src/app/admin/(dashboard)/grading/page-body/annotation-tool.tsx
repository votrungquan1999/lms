"use client";

import { useState } from "react";
import { saveAnnotationsAction } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import { AnnotationOverlay } from "src/components/annotation-overlay";
import { Button } from "src/components/ui/button";
import type { AnnotationEntry } from "src/lib/annotation-service";
import {
  AnnotationToolProvider,
  type MarkTool,
  useAnnotationTool,
} from "./annotation-tool.state";

/** Photo (key + presigned url) a grader can annotate. */
export interface AnnotatablePhoto {
  key: string;
  url: string;
}

const TOOLS: { tool: MarkTool; label: string }[] = [
  { tool: "pen", label: "Pen" },
  { tool: "circle", label: "Circle" },
  { tool: "arrow", label: "Arrow" },
];

/** Palette the grader can draw with (tokenized-ish fixed marker colors). */
const PALETTE = ["#ef4444", "#2563eb", "#16a34a", "#111827"];

/**
 * Grader annotation tool: draw freehand marks over a student's answer photos,
 * change color, undo, erase, and save. Wraps the body in the tool provider.
 * @param testId - The test id.
 * @param courseId - The course id.
 * @param questionId - The question id.
 * @param studentId - The student whose photos are annotated.
 * @param photos - The student's answer photos (key + presigned url).
 * @param initialAnnotations - Previously saved annotations to seed from.
 * @returns The annotation tool element.
 */
export function AnnotationTool({
  testId,
  courseId,
  questionId,
  studentId,
  photos,
  initialAnnotations,
}: {
  testId: string;
  courseId: string;
  questionId: string;
  studentId: string;
  photos: AnnotatablePhoto[];
  initialAnnotations: AnnotationEntry[];
}): React.ReactNode {
  return (
    <AnnotationToolProvider initialAnnotations={initialAnnotations}>
      <AnnotationToolBody
        testId={testId}
        courseId={courseId}
        questionId={questionId}
        studentId={studentId}
        photos={photos}
      />
    </AnnotationToolProvider>
  );
}

function AnnotationToolBody({
  testId,
  courseId,
  questionId,
  studentId,
  photos,
}: {
  testId: string;
  courseId: string;
  questionId: string;
  studentId: string;
  photos: AnnotatablePhoto[];
}): React.ReactNode {
  const { color, tool, entriesByKey, drawing, dispatch } = useAnnotationTool();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [fit, setFit] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  async function save() {
    setIsSaving(true);
    setMessage(null);
    const annotations: AnnotationEntry[] = Object.entries(entriesByKey).map(
      ([mediaKey, strokes]) => ({ mediaKey, strokes }),
    );
    const result = await saveAnnotationsAction({
      testId,
      courseId,
      questionId,
      studentId,
      annotationsJson: JSON.stringify(annotations),
    });
    setMessage(result.message);
    setIsSaving(false);
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
        {PALETTE.map((c) => (
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
                fit={fit}
              >
                <svg
                  aria-label="Drawing surface"
                  className="col-start-1 row-start-1 size-full cursor-crosshair touch-none [contain:size]"
                  onPointerDown={(e) => {
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
                  onPointerUp={() => dispatch({ type: "END_STROKE" })}
                  onPointerCancel={() => dispatch({ type: "END_STROKE" })}
                >
                  <title>Drawing surface</title>
                </svg>
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
                const marks = (entriesByKey[thumb.key] ?? []).length;
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
              Marks are saved with each photo
            </p>
          </div>
        );
      })()}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={isSaving} onClick={save}>
          {isSaving ? "Saving…" : "Save annotations"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
