import { getS3StorageService } from "./services-singleton";

/** A student answer photo with its freshly-minted presigned GET URL. */
export interface AnswerImage {
  key: string;
  url: string;
}

/**
 * Mints a presigned GET URL for each answer-photo S3 key, preserving order.
 * Returns an empty array for no keys.
 * @param mediaKeys - The stored S3 keys of a student's answer photos.
 * @returns Each key paired with a signed display URL.
 */
export async function attachAnswerImageUrls(
  mediaKeys: string[],
): Promise<AnswerImage[]> {
  if (mediaKeys.length === 0) {
    return [];
  }

  const s3 = await getS3StorageService();

  return Promise.all(
    mediaKeys.map(async (key) => ({
      key,
      url: await s3.getPresignedDownloadUrl(key),
    })),
  );
}
