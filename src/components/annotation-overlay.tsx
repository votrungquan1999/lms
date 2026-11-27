import type { CSSProperties } from "react";
import type {
  AnnotationPoint,
  AnnotationStroke,
  AnnotationText,
} from "src/lib/annotation-service";

/** Text marks scale with the photo width (container query units). */
export const TEXT_MARK_FONT_SIZE = "3cqw";

/** Past this share of the photo's width a text mark hangs from its spot toward the left. */
const TEXT_FLIP_X = 0.6;

/** Past this share of the photo's height a text mark hangs from its spot upward. */
const TEXT_FLIP_Y = 0.8;

/**
 * Where a text mark sits so it stays readable inside the photo: it grows right and down from its spot,
 * or left and up when the spot is near the right or bottom edge, and may use the room on its growing side.
 * @param point - The mark's spot, normalized (0..1).
 * @returns Absolute-position styles for the mark and its typing box.
 */
export function textMarkPlacement(point: AnnotationPoint): CSSProperties {
  const percent = (share: number) => `${Number((share * 100).toFixed(4))}%`;
  const fromRight = point.x > TEXT_FLIP_X;
  const fromBottom = point.y > TEXT_FLIP_Y;
  return {
    ...(fromRight
      ? { right: percent(1 - point.x) }
      : { left: percent(point.x) }),
    ...(fromBottom
      ? { bottom: percent(1 - point.y) }
      : { top: percent(point.y) }),
    maxWidth: percent(fromRight ? point.x : 1 - point.x),
  };
}

/** Line width as a share of the photo width, so a stroke keeps its look at every display size. */
const STROKE_WIDTH = "0.3cqw";

/**
 * Renders an image with vector annotation strokes drawn over it. The SVG uses a
 * `0 0 1 1` viewBox with `preserveAspectRatio="none"`, so normalized (0..1)
 * stroke coordinates map directly and stay aligned at any rendered size. The
 * image and SVG are stacked in a single grid cell (no absolute positioning).
 * The SVG's square viewBox would otherwise stretch the grid row, so size
 * containment lets the photo alone set the cell height.
 * Strokes are drawn with a width in container-width units, so lines scale with the photo like the text does.
 * @param src - The presigned image URL.
 * @param alt - Accessible image description.
 * @param strokes - The annotation strokes in normalized coordinates.
 * @param texts - Text marks in normalized coordinates, set in container-width units so they scale with the photo.
 * @param fit - True (default) scales the photo to the available width; false shows it at its real size.
 * @param children - Optional overlay (e.g. a drawing surface) in the same cell.
 */
export function AnnotationOverlay({
  src,
  alt,
  strokes,
  texts = [],
  fit = true,
  children,
}: {
  src: string;
  alt: string;
  strokes: AnnotationStroke[];
  texts?: AnnotationText[];
  fit?: boolean;
  children?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={fit ? "grid w-full max-w-2xl" : "grid w-max"}>
      {/* Presigned S3 URLs are short-lived/dynamic — next/image can't proxy
          them, so a plain <img> is intentional here. */}
      {/* biome-ignore lint/performance/noImgElement: presigned S3 url */}
      <img
        src={src}
        alt={alt}
        className={`col-start-1 row-start-1 rounded-md border border-border ${
          fit ? "w-full" : "max-w-none"
        }`}
      />
      <div className="col-start-1 row-start-1 size-full overflow-hidden [contain:size] @container">
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="size-full"
        >
          {strokes.map((stroke, strokeIndex) => (
            <polyline
              // biome-ignore lint/suspicious/noArrayIndexKey: stroke order is stable
              key={strokeIndex}
              points={(stroke.points ?? [])
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke={stroke.color}
              style={{ strokeWidth: STROKE_WIDTH }}
              strokeLinecap="round"
              strokeLinejoin="round"
              // The width is in screen units; the stretched 0-1 viewBox would otherwise thicken lines unevenly
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      {/* An HTML layer: SVG text would stretch with the non-uniform viewBox. */}
      <div className="pointer-events-none relative col-start-1 row-start-1 size-full overflow-hidden [contain:size] @container">
        {texts.map((mark, markIndex) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: mark order is stable
            key={markIndex}
            className="absolute break-words font-semibold leading-tight"
            style={{
              ...textMarkPlacement(mark),
              color: mark.color,
              fontSize: TEXT_MARK_FONT_SIZE,
            }}
          >
            {mark.text}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
