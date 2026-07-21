import type { CourseMaterial } from "src/lib/course-service";
import { MaterialsPickerProvider } from "./materials-picker.state";
import { MaterialRow, MaterialsUploadControl } from "./materials-section.ui";

/**
 * Admin course-materials section: shows the upload control and the list of a
 * course's downloadable materials, ordered.
 * @param courseId - The course these materials belong to.
 * @param materials - The course's materials (already URL-minted for download).
 * @returns The materials section element.
 */
export function MaterialsSection({
  courseId,
  materials,
}: {
  courseId: string;
  materials: CourseMaterial[];
}): React.ReactNode {
  const ordered = [...materials].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Materials ({materials.length})</h2>

      <MaterialsPickerProvider courseId={courseId}>
        <MaterialsUploadControl />
      </MaterialsPickerProvider>

      {ordered.length > 0 ? (
        <div className="space-y-2">
          {ordered.map((material) => (
            <MaterialRow
              key={material.key}
              courseId={courseId}
              materialKey={material.key}
              fileName={material.fileName}
              url={material.url}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No materials yet.</p>
      )}
    </div>
  );
}
