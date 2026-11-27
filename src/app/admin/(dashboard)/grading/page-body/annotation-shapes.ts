import type { AnnotationPoint } from "src/lib/annotation-service";

/** Rendered size of the drawing surface in pixels. */
export interface SurfaceSize {
  width: number;
  height: number;
}

const ELLIPSE_SEGMENTS = 32;
// Head limits as shares of the photo width, so a head looks the same however large the photo is shown.
const ARROW_HEAD_MIN_SHARE = 0.015;
const ARROW_HEAD_MAX_SHARE = 0.042;
const ARROW_HEAD_RATIO = 0.3;
const ARROW_HEAD_ANGLE = Math.PI / 6;

/**
 * Points of an ellipse inscribed in the box dragged from `from` to `to`.
 * @param from - Drag start, normalized (0..1).
 * @param to - Drag end, normalized (0..1).
 * @returns A closed polyline in normalized coordinates.
 */
export function ellipsePoints(
  from: AnnotationPoint,
  to: AnnotationPoint,
): AnnotationPoint[] {
  const centerX = (from.x + to.x) / 2;
  const centerY = (from.y + to.y) / 2;
  const radiusX = Math.abs(to.x - from.x) / 2;
  const radiusY = Math.abs(to.y - from.y) / 2;
  return Array.from({ length: ELLIPSE_SEGMENTS + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / ELLIPSE_SEGMENTS;
    return {
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
    };
  });
}

/**
 * Points of an arrow from `from` to `to`: the shaft, then the two head lines.
 * The head is built in screen pixels so it keeps its shape on a non-square photo.
 * @param from - Tail, normalized (0..1).
 * @param to - Tip, normalized (0..1).
 * @param size - Rendered surface size, used to measure the head in pixels.
 * @returns A polyline in normalized coordinates.
 */
export function arrowPoints(
  from: AnnotationPoint,
  to: AnnotationPoint,
  size: SurfaceSize,
): AnnotationPoint[] {
  // Work in pixels so the head angle and length survive a non-square photo
  const dx = (to.x - from.x) * size.width;
  const dy = (to.y - from.y) * size.height;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [from, to];
  const headLength = Math.min(
    size.width * ARROW_HEAD_MAX_SHARE,
    Math.max(size.width * ARROW_HEAD_MIN_SHARE, length * ARROW_HEAD_RATIO),
  );
  const backAngle = Math.atan2(dy, dx) + Math.PI;
  const wing = (offset: number): AnnotationPoint => ({
    x: to.x + (headLength * Math.cos(backAngle + offset)) / size.width,
    y: to.y + (headLength * Math.sin(backAngle + offset)) / size.height,
  });
  return [from, to, wing(ARROW_HEAD_ANGLE), to, wing(-ARROW_HEAD_ANGLE)];
}
