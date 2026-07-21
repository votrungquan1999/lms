import type { CourseMaterial } from "./course-service";
import { getS3StorageService } from "./services-singleton";

/**
 * Attaches a freshly-minted presigned attachment-download URL to each course
 * material, forcing the browser to download (not open) the file under its
 * original name. Returns a new array — never mutates the input.
 * @param materials - Course materials carrying stored S3 keys.
 * @returns Materials with each `url` populated for download.
 */
export async function attachCourseMaterialUrls(
  materials: CourseMaterial[],
): Promise<CourseMaterial[]> {
  const s3 = await getS3StorageService();

  return Promise.all(
    materials.map(async (entry) => ({
      ...entry,
      url: await s3.getPresignedDownloadUrl(entry.key, undefined, {
        fileName: entry.fileName,
      }),
    })),
  );
}
