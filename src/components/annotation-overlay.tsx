import type { AnnotationStroke } from "src/lib/annotation-service";

/**
 * Renders an image with vector annotation strokes drawn over it. The SVG uses a
 * `0 0 1 1` viewBox with `preserveAspectRatio="none"`, so normalized (0..1)
 * stroke coordinates map directly and stay aligned at any rendered size. The
 * image and SVG are stacked in a single grid cell (no absolute positioning).
 * Strokes use a non-scaling stroke width so lines stay a constant thickness.
 * @param src - The presigned image URL.
 * @param alt - Accessible image description.
 * @param strokes - The annotation strokes in normalized coordinates.
 * @param children - Optional overlay (e.g. a drawing surface) in the same cell.
 */
export function AnnotationOverlay({
  src,
  alt,
  strokes,
  children,
}: {
  src: string;
  alt: string;
  strokes: AnnotationStroke[];
  children?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="grid w-full max-w-2xl">
      {/* Presigned S3 URLs are short-lived/dynamic — next/image can't proxy
          them, so a plain <img> is intentional here. */}
      {/* biome-ignore lint/performance/noImgElement: presigned S3 url */}
      <img
        src={src}
        alt={alt}
        className="col-start-1 row-start-1 w-full rounded-md border border-border"
      />
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="col-start-1 row-start-1 size-full"
      >
        {strokes.map((stroke, strokeIndex) => (
          <polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: stroke order is stable
            key={strokeIndex}
            points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={stroke.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {children}
    </div>
  );
}
