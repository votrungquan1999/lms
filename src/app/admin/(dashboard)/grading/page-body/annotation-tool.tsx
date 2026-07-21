"use client";

import { useState } from "react";
import { saveAnnotationsAction } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import { AnnotationOverlay } from "src/components/annotation-overlay";
import { Button } from "src/components/ui/button";
import type { AnnotationEntry } from "src/lib/annotation-service";
import {
  AnnotationToolProvider,
  useAnnotationTool,
} from "./annotation-tool.state";

/** Photo (key + presigned url) a grader can annotate. */
export interface AnnotatablePhoto {
  key: string;
  url: string;
}

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
  const { color, entriesByKey, drawing, dispatch } = useAnnotationTool();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      <div className="flex items-center gap-2">
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

      {photos.map((photo) => {
        const committed = entriesByKey[photo.key] ?? [];
        const live =
          drawing && drawing.mediaKey === photo.key ? [drawing.stroke] : [];
        return (
          <div key={photo.key} className="space-y-2">
            <AnnotationOverlay
              src={photo.url}
              alt="Student submitted work"
              strokes={[...committed, ...live]}
            >
              <svg
                aria-label="Drawing surface"
                className="col-start-1 row-start-1 size-full cursor-crosshair touch-none"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dispatch({
                    type: "START_STROKE",
                    mediaKey: photo.key,
                    point: toPoint(e),
                  });
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return;
                  dispatch({ type: "ADD_POINT", point: toPoint(e) });
                }}
                onPointerUp={() => dispatch({ type: "END_STROKE" })}
              >
                <title>Drawing surface</title>
              </svg>
            </AnnotationOverlay>

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
                Erase all
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={isSaving} onClick={save}>
          {isSaving ? "Saving…" : "Save annotations"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
