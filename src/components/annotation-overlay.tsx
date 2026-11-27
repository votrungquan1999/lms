import type {
  AnnotationStroke,
  AnnotationText,
} from "src/lib/annotation-service";

/** Text marks scale with the photo width (container query units). */
export const TEXT_MARK_FONT_SIZE = "3cqw";

/**
 * Renders an image with vector annotation strokes drawn over it. The SVG uses a
 * `0 0 1 1` viewBox with `preserveAspectRatio="none"`, so normalized (0..1)
 * stroke coordinates map directly and stay aligned at any rendered size. The
 * image and SVG are stacked in a single grid cell (no absolute positioning).
 * The SVG's square viewBox would otherwise stretch the grid row, so size
 * containment lets the photo alone set the cell height.
 * Strokes use a non-scaling stroke width so lines stay a constant thickness.
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
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="col-start-1 row-start-1 size-full [contain:size]"
      >
        {strokes.map((stroke, strokeIndex) => (
          <polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: stroke order is stable
            key={strokeIndex}
            points={(stroke.points ?? []).map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={stroke.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {/* An HTML layer: SVG text would stretch with the non-uniform viewBox. */}
      <div className="pointer-events-none relative col-start-1 row-start-1 size-full overflow-hidden [contain:size] @container">
        {texts.map((mark, markIndex) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: mark order is stable
            key={markIndex}
            className="absolute break-words font-semibold leading-tight"
            style={{
              left: `${mark.x * 100}%`,
              top: `${mark.y * 100}%`,
              maxWidth: `${(1 - mark.x) * 100}%`,
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
