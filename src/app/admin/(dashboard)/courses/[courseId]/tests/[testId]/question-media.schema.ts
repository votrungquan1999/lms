import { MediaContentType } from "src/lib/question-service";
import { z } from "zod";

/** Maximum media files attachable to one question. */
export const MAX_MEDIA_PER_QUESTION = 3;

/** Maximum media file size in bytes (10 MB). */
export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;

/** File extension per allowed media content-type, for building S3 keys. */
export const EXTENSION_BY_CONTENT_TYPE: Record<MediaContentType, string> = {
  [MediaContentType.PNG]: "png",
  [MediaContentType.JPEG]: "jpg",
  [MediaContentType.WEBP]: "webp",
  [MediaContentType.MP4]: "mp4",
};

/**
 * Shared schema for a single media entry. Used by the upload-slots request
 * (where `key` is not yet known) and by `addQuestionAction` (where it is).
 * Size is the client-declared byte count — a best-effort guard, not true
 * enforcement (presigned PUT can't verify actual bytes; see plan limitation).
 */
export const mediaItemSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  contentType: z.nativeEnum(MediaContentType, {
    message: "Unsupported media type",
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_MEDIA_SIZE_BYTES, "Each media file must be 10 MB or smaller"),
});

/** Schema for the files a teacher requests upload slots for (count-capped). */
export const requestUploadSlotsSchema = z
  .array(mediaItemSchema)
  .max(MAX_MEDIA_PER_QUESTION, "A question can have at most 3 media files");

/** Schema for the stored media entries submitted alongside a created question. */
export const submittedMediaSchema = z
  .array(
    mediaItemSchema.extend({
      key: z.string().min(1, "Media key is required"),
      order: z.number().int().nonnegative(),
    }),
  )
  .max(MAX_MEDIA_PER_QUESTION, "A question can have at most 3 media files");

/** Validated, ordered media entries persisted alongside a created question. */
export type SubmittedMedia = z.infer<typeof submittedMediaSchema>;

export interface RequestUploadSlotsInput {
  fileName: string;
  contentType: string;
  size: number;
}

export interface UploadSlot {
  key: string;
  url: string;
  contentType: string;
  order: number;
}

export interface RequestUploadSlotsState {
  success: boolean;
  message: string;
  slots?: UploadSlot[];
}
