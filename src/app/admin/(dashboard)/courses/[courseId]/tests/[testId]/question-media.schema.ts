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

/**
 * The submitted-media schema plus the tenant rule: every key must be one this
 * school could have minted. Signing a URL is the only access control on the
 * bucket, so a stored foreign key would be readable. The key check runs after
 * the shape checks, so a malformed entry still reports its shape message.
 * @param schoolId - The school the question is being written into.
 * @returns A schema whose parsed data holds only the known media fields.
 */
export function submittedMediaSchemaFor(schoolId: string) {
  return submittedMediaSchema.refine(
    (items) =>
      items.every((item) => isValidQuestionMediaKey(item.key, schoolId)),
    { message: "Invalid media key" },
  );
}

/**
 * True only for a key shaped like one this school's admin could have minted
 * through `requestUploadSlotsAction` — an exact anchored match, not a
 * prefix, so `..`, an extra path segment, and a trailing `?`/`#` all fail
 * (CloudFront URLs are built from the raw key).
 */
export function isValidQuestionMediaKey(
  key: string,
  schoolId: string,
): boolean {
  const escapedSchoolId = schoolId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const extensions = Object.values(EXTENSION_BY_CONTENT_TYPE).join("|");
  const pattern = new RegExp(
    `^media/schools/${escapedSchoolId}/questions/[0-9a-f-]+\\.(${extensions})$`,
  );
  return pattern.test(key);
}

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
