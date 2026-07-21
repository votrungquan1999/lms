import { z } from "zod";

/**
 * Allowed MIME types for student answer photos. Image-only on purpose — a
 * handwritten-work photo is never a video. Separate from question media
 * (`MediaContentType`, which includes mp4).
 */
export enum AnswerImageContentType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  WEBP = "image/webp",
}

/** Maximum answer-photo file size in bytes (10 MB). */
export const MAX_ANSWER_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of photos a student may attach to one answer. */
export const MAX_ANSWER_IMAGES = 3;

/** File extension per allowed answer-image content-type, for building S3 keys. */
export const ANSWER_IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<
  AnswerImageContentType,
  string
> = {
  [AnswerImageContentType.PNG]: "png",
  [AnswerImageContentType.JPEG]: "jpg",
  [AnswerImageContentType.WEBP]: "webp",
};

/** Shared schema for a single requested answer-photo upload. */
export const answerImageItemSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  contentType: z.nativeEnum(AnswerImageContentType, {
    message: "Unsupported image type",
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_ANSWER_IMAGE_SIZE_BYTES, "Each photo must be 10 MB or smaller"),
});

/** Schema for the photos a student requests upload slots for (count-capped). */
export const requestAnswerImageUploadSlotsSchema = z
  .array(answerImageItemSchema)
  .max(MAX_ANSWER_IMAGES, "You can attach at most 3 photos");

/** A single photo the student requests an upload slot for. */
export interface RequestAnswerImageUploadSlotsInput {
  fileName: string;
  contentType: string;
  size: number;
}

/** A presigned PUT upload destination for one answer photo. */
export interface AnswerImageUploadSlot {
  key: string;
  url: string;
  contentType: string;
  fileName: string;
  size: number;
  order: number;
}

/** Result of requesting answer-photo upload slots. */
export interface RequestAnswerImageUploadSlotsState {
  success: boolean;
  message: string;
  slots?: AnswerImageUploadSlot[];
}
