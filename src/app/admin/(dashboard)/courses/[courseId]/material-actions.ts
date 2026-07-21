"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getCourseService,
  getS3StorageService,
} from "src/lib/services-singleton";
import {
  type CourseMaterialMutationState,
  MATERIAL_EXTENSION_BY_CONTENT_TYPE,
  type MaterialContentType,
  type RequestMaterialUploadSlotsInput,
  type RequestMaterialUploadSlotsState,
  requestMaterialUploadSlotsSchema,
  type SubmittedMaterial,
  submittedMaterialSchema,
} from "./material-upload.schema";

/**
 * Server action: validates the requested course-material files (type/size) and
 * mints a presigned PUT upload slot per file, scoped under the course's S3
 * namespace (`materials/courses/<courseId>/<uuid>.<ext>`), preserving order.
 * Does not persist anything — the metadata is saved by a separate action.
 * @param courseId - The course the materials belong to (used to build keys).
 * @param files - The files the instructor wants to upload, in chosen order.
 * @returns Presigned PUT slots in order, or a failure message.
 */
export async function requestMaterialUploadSlotsAction(
  courseId: string,
  files: RequestMaterialUploadSlotsInput[],
): Promise<RequestMaterialUploadSlotsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  // courseId is interpolated into the S3 key path; reject path separators so a
  // crafted id can't escape the `materials/courses/<courseId>/` namespace.
  if (courseId.length === 0 || /[/\\]|\.\./.test(courseId)) {
    return { success: false, message: "Invalid course id" };
  }

  const parsed = requestMaterialUploadSlotsSchema.safeParse(files);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  return withSpan(
    "action.requestMaterialUploadSlotsAction",
    { "lms.action.name": "requestMaterialUploadSlotsAction" },
    async () => {
      const s3 = await getS3StorageService();

      const slots = await Promise.all(
        parsed.data.map(async (file, index) => {
          const extension =
            MATERIAL_EXTENSION_BY_CONTENT_TYPE[
              file.contentType as MaterialContentType
            ];
          const key = `materials/courses/${courseId}/${randomUUID()}.${extension}`;
          const { url } = await s3.getPresignedUploadUrl(key, file.contentType);
          return {
            key,
            url,
            contentType: file.contentType,
            fileName: file.fileName,
            size: file.size,
            order: index,
          };
        }),
      );

      return { success: true, message: "Upload slots created", slots };
    },
  );
}

/**
 * Server action: persists an already-uploaded material's metadata against the
 * course and revalidates the course page.
 * @param courseId - The course to attach the material to.
 * @param material - The uploaded material's metadata (key, type, name, size).
 * @returns Success or a failure message.
 */
export async function addCourseMaterialAction(
  courseId: string,
  material: SubmittedMaterial,
): Promise<CourseMaterialMutationState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = submittedMaterialSchema.safeParse(material);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  // The client sends a raw S3 key; it is later served to enrolled students as
  // a signed download link. Confine it to this course's own namespace so a
  // stray/crafted key can't turn into an arbitrary-object download.
  const coursePrefix = `materials/courses/${courseId}/`;
  if (
    !parsed.data.key.startsWith(coursePrefix) ||
    parsed.data.key.slice(coursePrefix.length).includes("/")
  ) {
    return { success: false, message: "Invalid material key" };
  }

  return withSpan(
    "action.addCourseMaterialAction",
    { "lms.action.name": "addCourseMaterialAction" },
    async () => {
      const courseService = await getCourseService();
      await courseService.addCourseMaterial(courseId, {
        key: parsed.data.key,
        contentType: parsed.data.contentType,
        fileName: parsed.data.fileName,
        size: parsed.data.size,
      });
      revalidatePath(`/admin/courses/${courseId}`);
      return { success: true, message: "Material added" };
    },
  );
}

/**
 * Server action: removes a material from the course by its S3 key and
 * revalidates the course page.
 * @param courseId - The course to remove the material from.
 * @param materialKey - The S3 key of the material to remove.
 * @returns Success or a failure message.
 */
export async function removeCourseMaterialAction(
  courseId: string,
  materialKey: string,
): Promise<CourseMaterialMutationState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  return withSpan(
    "action.removeCourseMaterialAction",
    { "lms.action.name": "removeCourseMaterialAction" },
    async () => {
      const courseService = await getCourseService();
      await courseService.removeCourseMaterial(courseId, materialKey);
      revalidatePath(`/admin/courses/${courseId}`);
      return { success: true, message: "Material removed" };
    },
  );
}
