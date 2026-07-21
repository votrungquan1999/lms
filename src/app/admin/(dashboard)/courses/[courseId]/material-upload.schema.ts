import { z } from "zod";

/**
 * Allowed content types for course materials. Separate from question media
 * (`MediaContentType`) on purpose: materials are downloadable documents, not
 * inline question media. Values are the canonical lowercase MIME strings.
 *
 * Known limitation: some browsers/OS send `application/x-zip-compressed` for
 * `.zip` files; only the canonical `application/zip` is accepted here.
 */
export enum MaterialContentType {
  PDF = "application/pdf",
  DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ZIP = "application/zip",
  PNG = "image/png",
  JPEG = "image/jpeg",
  WEBP = "image/webp",
}

/** Maximum course material file size in bytes (10 MB). */
export const MAX_MATERIAL_SIZE_BYTES = 10 * 1024 * 1024;

/** File extension per allowed material content-type, for building S3 keys. */
export const MATERIAL_EXTENSION_BY_CONTENT_TYPE: Record<
  MaterialContentType,
  string
> = {
  [MaterialContentType.PDF]: "pdf",
  [MaterialContentType.DOCX]: "docx",
  [MaterialContentType.XLSX]: "xlsx",
  [MaterialContentType.PPTX]: "pptx",
  [MaterialContentType.ZIP]: "zip",
  [MaterialContentType.PNG]: "png",
  [MaterialContentType.JPEG]: "jpg",
  [MaterialContentType.WEBP]: "webp",
};

/**
 * Shared schema for a single requested material entry. `size` is the
 * client-declared byte count — a best-effort guard, not true enforcement
 * (a presigned PUT can't verify the actual uploaded bytes).
 */
export const materialItemSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  contentType: z.nativeEnum(MaterialContentType, {
    message: "Unsupported file type",
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_MATERIAL_SIZE_BYTES, "Each file must be 10 MB or smaller"),
});

/** Schema for the files a teacher requests material upload slots for. */
export const requestMaterialUploadSlotsSchema = z.array(materialItemSchema);

/** A single file the teacher requests an upload slot for. */
export interface RequestMaterialUploadSlotsInput {
  fileName: string;
  contentType: string;
  size: number;
}

/** A presigned PUT upload destination for one material file. */
export interface MaterialUploadSlot {
  key: string;
  url: string;
  contentType: string;
  fileName: string;
  size: number;
  order: number;
}

/** Result of requesting material upload slots. */
export interface RequestMaterialUploadSlotsState {
  success: boolean;
  message: string;
  slots?: MaterialUploadSlot[];
}

/** Schema for a material's metadata persisted after its S3 upload succeeds. */
export const submittedMaterialSchema = materialItemSchema.extend({
  key: z.string().min(1, "Material key is required"),
});

/** Validated material metadata persisted against a course. */
export type SubmittedMaterial = z.infer<typeof submittedMaterialSchema>;

/** Result of a course-material mutation (persist / remove). */
export interface CourseMaterialMutationState {
  success: boolean;
  message: string;
}
