import {
  INVALID_MEDIA_KEY_MESSAGE,
  MAX_MEDIA_PER_QUESTION,
} from "src/lib/question-media-merge";
import { MediaContentType } from "src/lib/question-service";
import { z } from "zod";

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

/**
 * Shape of the stored media entries submitted alongside a created question.
 * Private: it lacks the school check, so write paths use `submittedMediaSchemaFor`.
 */
const submittedMediaEntrySchema = mediaItemSchema.extend({
  key: z.string().min(1, "Media key is required"),
  order: z.number().int().nonnegative(),
});

const submittedMediaSchema = z
  .array(submittedMediaEntrySchema)
  .max(MAX_MEDIA_PER_QUESTION, "A question can have at most 3 media files");

/** Validated, ordered media entries persisted alongside a created question. */
export type SubmittedMedia = z.infer<typeof submittedMediaSchema>;

/**
 * The submitted-media schema plus the tenant rule: every key must be one this
 * school could have minted. Signing a URL is the only access control on the
 * bucket, so a stored foreign key would be readable. Each key's extension must
 * also match its declared type, since students' pages render by that type.
 * The key check runs after the shape checks, so a malformed entry still
 * reports its shape message.
 * @param schoolId - The school the question is being written into.
 * @returns A schema whose parsed data holds only the known media fields.
 */
export function submittedMediaSchemaFor(schoolId: string) {
  return submittedMediaSchema.refine(
    (items) =>
      items.every(
        (item) =>
          isValidQuestionMediaKey(item.key, schoolId) &&
          item.key.endsWith(`.${EXTENSION_BY_CONTENT_TYPE[item.contentType]}`),
      ),
    { message: INVALID_MEDIA_KEY_MESSAGE },
  );
}

/**
 * The media-change schema for a question save: the keys the teacher removed
 * and the newly uploaded files (school-checked like `submittedMediaSchemaFor`).
 * Whether a removed key is still held is decided at merge time, against the
 * question's current pictures.
 * @param schoolId - The school the question belongs to.
 * @returns A schema whose parsed data is the removed keys and the new uploads.
 */
export function mediaChangeSchemaFor(schoolId: string) {
  return z.strictObject({
    removedKeys: z.array(z.string().min(1, "Media key is required")),
    added: submittedMediaSchemaFor(schoolId),
  });
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
