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
