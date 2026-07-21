import { Download } from "lucide-react";
import type { CourseMaterial } from "src/lib/course-service";

/**
 * Read-only list of a course's downloadable materials for students. Each entry
 * is a download link to the file, ordered. Renders nothing when empty.
 * @param materials - The course materials, each with a minted download url.
 * @returns The materials list element, or null when there are no materials.
 */
export function MaterialsList({
  materials,
}: {
  materials: CourseMaterial[];
}): React.ReactNode {
  if (materials.length === 0) {
    return null;
  }

  const ordered = [...materials].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-2">
      {ordered.map((material) => (
        <a
          key={material.key}
          href={material.url}
          download={material.fileName}
          className="flex items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/50"
        >
          <Download className="size-4 text-muted-foreground" />
          {material.fileName}
        </a>
      ))}
    </div>
  );
}
