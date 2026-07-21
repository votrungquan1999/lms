import { describe, expect, it } from "vitest";
import {
  AnswerImageContentType,
  MAX_ANSWER_IMAGES,
  requestAnswerImageUploadSlotsSchema,
} from "../answer-image-upload.schema";

/** Builds N valid answer-image upload requests. */
function buildPhotos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    fileName: `page${i}.png`,
    contentType: AnswerImageContentType.PNG,
    size: 1000,
  }));
}

describe("requestAnswerImageUploadSlotsSchema", () => {
  it("accepts up to the maximum number of photos", () => {
    const result = requestAnswerImageUploadSlotsSchema.safeParse(
      buildPhotos(MAX_ANSWER_IMAGES),
    );
    expect(result.success).toBe(true);
  });

  it("rejects more than the maximum number of photos", () => {
    const result = requestAnswerImageUploadSlotsSchema.safeParse(
      buildPhotos(MAX_ANSWER_IMAGES + 1),
    );
    expect(result.success).toBe(false);
  });
});
