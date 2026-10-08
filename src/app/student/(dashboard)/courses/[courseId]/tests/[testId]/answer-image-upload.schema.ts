import {
  AnswerImageContentType,
  MAX_ANSWER_IMAGE_SIZE_BYTES,
  MAX_ANSWER_IMAGES,
} from "src/lib/answer-photo-rules";
import { z } from "zod";

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
