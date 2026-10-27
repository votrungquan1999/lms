import type { MediaContentType } from "src/lib/question-service";
import type { SubmittedMedia } from "../question-media.schema";
import { requestUploadSlotsAction } from "../question-media-actions";

/** A job of `runInOrder` that threw, by its position. */
export interface JobFailure {
  index: number;
  error: unknown;
}

/**
 * Uploads one question's pictures straight to storage, the same way the
 * add-question form uploads media, and returns the entries to save with it.
 * @param files - The question's pictures, in document order.
 * @returns The uploaded media entries, in order.
 */
export async function uploadPictures(files: File[]): Promise<SubmittedMedia> {
  if (files.length === 0) return [];

  const slotResult = await requestUploadSlotsAction(
    files.map((file) => ({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })),
  );
  if (!slotResult.success || !slotResult.slots) {
    throw new Error(slotResult.message);
  }

  const { slots } = slotResult;
  await Promise.all(
    slots.map((slot, i) =>
      fetch(slot.url, {
        method: "PUT",
        headers: { "Content-Type": files[i].type },
        body: files[i],
      }).then((res) => {
        if (!res.ok) throw new Error(`Upload failed for ${files[i].name}`);
      }),
    ),
  );

  return slots.map((slot, i) => ({
    fileName: files[i].name,
    contentType: files[i].type as MediaContentType,
    size: files[i].size,
    key: slot.key,
    order: slot.order,
  }));
}

/** How many questions' pictures upload at the same time on Import. */
export const UPLOAD_CONCURRENCY = 4;

/**
 * Starts jobs in list order, at most `limit` at a time. After one fails no
 * new job starts; those already running finish first.
 * @param jobs - The jobs, in the order they should start.
 * @param limit - The most jobs running at once.
 * @returns The failed job earliest in the list, or null when none failed.
 */
export async function runInOrder(
  jobs: (() => Promise<void>)[],
  limit: number,
): Promise<JobFailure | null> {
  let next = 0;
  const failures: JobFailure[] = [];
  async function work(): Promise<void> {
    while (next < jobs.length && failures.length === 0) {
      const index = next++;
      // Boundary: a failure is collected, so the jobs still running can settle.
      try {
        await jobs[index]();
      } catch (error) {
        failures.push({ index, error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, work));
  // Jobs start in order, so every job before the earliest failure has settled.
  return failures.reduce<JobFailure | null>(
    (first, failure) =>
      first && first.index < failure.index ? first : failure,
    null,
  );
}
