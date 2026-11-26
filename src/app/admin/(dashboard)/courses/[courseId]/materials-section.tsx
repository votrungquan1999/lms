import type { CourseMaterial } from "src/lib/course-service";
import { formatVietnamDate } from "src/lib/format-date";
import { formatFileSize } from "src/lib/format-file-size";
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
  // A remove then add can repeat a position, so upload time breaks the tie.
  const ordered = [...materials].sort(
    (a, b) =>
      a.order - b.order ||
      a.uploadedAt.getTime() - b.uploadedAt.getTime() ||
      a.key.localeCompare(b.key),
  );

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Materials ({materials.length})</h2>

      <MaterialsPickerProvider courseId={courseId}>
        <MaterialsUploadControl />
      </MaterialsPickerProvider>

      {ordered.length > 0 ? (
        // Below md the rows stack, so Download and Remove stay on screen with no sideways scroll.
        <div className="rounded-xl border bg-card md:overflow-x-auto">
          <table className="block w-full text-sm md:table">
            <thead className="hidden bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">File</th>
                <th className="px-4 py-2.5 font-semibold">Size</th>
                <th className="px-4 py-2.5 font-semibold">Uploaded</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {ordered.map((material) => (
                <MaterialRow
                  key={material.key}
                  courseId={courseId}
                  materialKey={material.key}
                  fileName={material.fileName}
                  url={material.url}
                  size={formatFileSize(material.size)}
                  uploaded={formatVietnamDate(material.uploadedAt)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No materials yet.</p>
      )}
    </div>
  );
}
