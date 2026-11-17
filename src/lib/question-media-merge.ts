import type {
  QuestionMediaDocument,
  QuestionMediaInput,
} from "./question-service";

/** The refusal of a key this question or school could not have minted, or one listed twice. */
export const INVALID_MEDIA_KEY_MESSAGE = "Invalid media key";

/** Maximum media files attachable to one question. */
export const MAX_MEDIA_PER_QUESTION = 3;

/** A picture the question already holds, named by its stored key only. */
export interface KeptMediaEntry {
  key: string;
}

/** One entry of an edited media list: a kept picture or a newly uploaded one. */
export type EditedMediaEntry = KeptMediaEntry | QuestionMediaInput;

/**
 * Builds a question's saved media list from the teacher's edited list: kept
 * entries take their stored details, new entries are used as submitted, and
 * every entry is renumbered by its position.
 * @param before - The media the question holds today.
 * @param submitted - The ordered edited list (kept `{ key }` or full new entries).
 * @returns The ordered media to store.
 * @throws When a kept key is not on the question, a key repeats, or more than 3 remain.
 */
export function mergeEditedMedia(
  before: QuestionMediaDocument[],
  submitted: EditedMediaEntry[],
): QuestionMediaDocument[] {
  const storedByKey = new Map(before.map((entry) => [entry.key, entry]));
  const seen = new Set<string>();

  const merged = submitted.map((entry, order) => {
    if (seen.has(entry.key)) {
      throw new Error(INVALID_MEDIA_KEY_MESSAGE);
    }
    seen.add(entry.key);

    // A full entry carries its own details; a bare key must already be stored
    if ("contentType" in entry) {
      return { ...entry, order };
    }
    const stored = storedByKey.get(entry.key);
    if (!stored) {
      throw new Error(INVALID_MEDIA_KEY_MESSAGE);
    }
    return { ...stored, order };
  });

  if (merged.length > MAX_MEDIA_PER_QUESTION) {
    throw new Error(
      `A question can have at most ${MAX_MEDIA_PER_QUESTION} media files`,
    );
  }
  return merged;
}
