import {
  AnswerImageContentType,
  MAX_ANSWER_IMAGE_SIZE_BYTES,
  MAX_ANSWER_IMAGES,
} from "src/lib/answer-photo-rules";

/** Files that passed the photo rules, and the message for the last one that failed. */
export interface AnswerPhotoValidation<T> {
  accepted: T[];
  error: string | null;
}

const ALLOWED_CONTENT_TYPES = Object.values(AnswerImageContentType) as string[];

/**
 * Applies the student photo rules (type, size, count) to freshly chosen files.
 * Pure on purpose, so the student picker and the teacher's Student view
 * preview show identical messages.
 * @param files - The files the user just chose, in order.
 * @param alreadyPicked - How many photos are already attached.
 * @returns The files that pass, and the message for the last one that failed (null when none).
 */
export function validateAnswerPhotos<T extends { type: string; size: number }>(
  files: T[],
  alreadyPicked: number,
): AnswerPhotoValidation<T> {
  const accepted: T[] = [];
  let error: string | null = null;

  for (const file of files) {
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      error = "Unsupported image type";
      continue;
    }
    if (file.size > MAX_ANSWER_IMAGE_SIZE_BYTES) {
      error = "Each photo must be 10 MB or smaller";
      continue;
    }
    if (alreadyPicked + accepted.length >= MAX_ANSWER_IMAGES) {
      error = `You can attach at most ${MAX_ANSWER_IMAGES} photos`;
      continue;
    }
    accepted.push(file);
  }

  return { accepted, error };
}
