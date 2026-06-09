import type { Question } from "./question-service";
import { getS3StorageService } from "./services-singleton";

/**
 * Attaches a freshly-minted presigned GET URL to each media entry of every
 * question, preserving media order. Questions with no media are returned
 * unchanged. Returns a new array — never mutates the input.
 * @param questions - Questions whose media entries carry stored S3 keys.
 * @returns Questions with each `media[].url` populated.
 */
export async function attachQuestionMediaUrls(
  questions: Question[],
): Promise<Question[]> {
  const s3 = await getS3StorageService();

  return Promise.all(
    questions.map(async (question) => {
      if (question.media.length === 0) {
        return question;
      }

      const media = await Promise.all(
        question.media.map(async (entry) => ({
          ...entry,
          url: await s3.getPresignedDownloadUrl(entry.key),
        })),
      );

      return { ...question, media };
    }),
  );
}
