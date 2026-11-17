import { logError } from "./observability/log-error";
import type { QuestionService } from "./question-service";
import type { S3StorageService } from "./s3-storage-service";

/**
 * Deletes dropped media files that no other live question still holds. It is
 * housekeeping after a save that already succeeded, so a failure is logged and
 * never rethrown.
 * @param questionService - Answers which keys are still referenced.
 * @param s3 - Storage the files are deleted from.
 * @param droppedKeys - Keys the saved question no longer lists.
 */
export async function deleteUnreferencedMedia(
  questionService: QuestionService,
  s3: Pick<S3StorageService, "deleteObjects">,
  droppedKeys: string[],
): Promise<void> {
  try {
    const orphaned =
      await questionService.findUnreferencedMediaKeys(droppedKeys);
    await s3.deleteObjects(orphaned);
  } catch (error) {
    logError(error);
  }
}
