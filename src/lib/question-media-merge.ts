import { linkKeysIn } from "src/lib/picture-links";
import type {
  QuestionMediaDocument,
  QuestionMediaInput,
} from "./question-service";

/** The refusal of a key this question or school could not have minted, or one listed twice. */
export const INVALID_MEDIA_KEY_MESSAGE = "Invalid media key";

/** Maximum media files attachable to one question. */
export const MAX_MEDIA_PER_QUESTION = 3;

/** What a teacher's save does to a question's pictures: keys removed and new uploads. */
export interface MediaChange {
  removedKeys: string[];
  added: QuestionMediaInput[];
}

/** The outcome of applying a media change to a question's current pictures. */
export interface MergedMedia {
  /** The ordered media to store. */
  media: QuestionMediaDocument[];
  /** The keys the question actually lost (a removed key it no longer held is not listed). */
  removedKeys: string[];
}

/**
 * Applies a teacher's removals and new uploads to the pictures the question
 * holds right now, so a picture another teacher added meanwhile is kept.
 * @param current - The media the question holds at save time.
 * @param change - The keys to remove and the new uploads to append.
 * @returns The ordered media to store (renumbered by position) and the keys actually removed.
 * @throws When an added key repeats or is already held, or more than 3 remain.
 */
export function applyMediaChange(
  current: QuestionMediaDocument[],
  change: MediaChange,
): MergedMedia {
  const removing = new Set(change.removedKeys);
  const heldKeys = new Set(current.map((entry) => entry.key));
  const seenAdded = new Set<string>();
  for (const entry of change.added) {
    if (
      seenAdded.has(entry.key) ||
      heldKeys.has(entry.key) ||
      removing.has(entry.key)
    ) {
      throw new Error(INVALID_MEDIA_KEY_MESSAGE);
    }
    seenAdded.add(entry.key);
  }

  const kept = [...current]
    .sort((a, b) => a.order - b.order)
    .filter((entry) => !removing.has(entry.key));
  const media = [...kept, ...change.added].map((entry, order) => ({
    ...entry,
    order,
  }));

  if (media.length > MAX_MEDIA_PER_QUESTION) {
    throw new Error(
      `A question can have at most ${MAX_MEDIA_PER_QUESTION} media files`,
    );
  }
  return {
    media,
    removedKeys: current
      .filter((entry) => removing.has(entry.key))
      .map((entry) => entry.key),
  };
}

/** A media entry as far as the picture-link check cares. */
interface HeldMediaEntry {
  key: string;
  contentType: string;
}

/**
 * Finds a link in the texts that names a picture the question never held (a
 * hand-typed or foreign key, or a video). A link to a picture removed by the
 * same save, or one already in the question's saved text, is allowed.
 * @param texts - The title, content and option texts being saved.
 * @param held - Every media entry the question holds before or after the save.
 * @param savedTexts - The question's saved texts before the save.
 * @returns The first offending key, or null when every link is allowed.
 */
export function findUnheldPictureLink(
  texts: readonly string[],
  held: readonly HeldMediaEntry[],
  savedTexts: readonly string[] = [],
): string | null {
  const allowed = new Set([
    ...held
      .filter((entry) => !entry.contentType.startsWith("video/"))
      .map((entry) => entry.key),
    ...savedTexts.flatMap(linkKeysIn),
  ]);
  return texts.flatMap(linkKeysIn).find((key) => !allowed.has(key)) ?? null;
}

/**
 * Refuses text that links a picture the question never held.
 * @param texts - The title, content and option texts being saved.
 * @param held - Every media entry the question holds before or after the save.
 * @param savedTexts - The question's saved texts before the save.
 * @throws When a link names a key that is not an allowed picture.
 */
export function assertPictureLinksHeld(
  texts: readonly string[],
  held: readonly HeldMediaEntry[],
  savedTexts: readonly string[] = [],
): void {
  if (findUnheldPictureLink(texts, held, savedTexts) !== null) {
    throw new Error(INVALID_MEDIA_KEY_MESSAGE);
  }
}
