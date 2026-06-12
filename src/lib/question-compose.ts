import type {
  McGradingStrategy,
  McOption,
  QuestionMediaInput,
  QuestionType,
} from "src/lib/question-service";

/**
 * A single pool question's full field set, pre-fetched by the caller so
 * `QuestionService.composeFromPools` stays decoupled from `PoolQuestionService`.
 * Media keys are copied verbatim (shared S3, read-only); option ids are
 * regenerated on copy.
 */
export interface PoolQuestionSnapshotInput {
  title: string;
  content: string;
  type: QuestionType;
  options: McOption[] | null;
  weight: number;
  mcGradingStrategy: McGradingStrategy | null;
  media: QuestionMediaInput[];
}

/**
 * One pool's contribution to a composed test: the pool's available questions
 * and how many to draw from it.
 */
export interface ComposePoolSelection {
  questions: PoolQuestionSnapshotInput[];
  count: number;
}

/**
 * Selects up to `count` items from `items`. Injectable so tests can pass a
 * deterministic stub; the service defaults to `shuffleAndTake`.
 */
export type QuestionSampler = <T>(items: T[], count: number) => T[];

/**
 * Default question sampler: Fisher-Yates shuffle, then take the first `count`.
 * Returns all items (shuffled) when `count` exceeds the list length, and an
 * empty list when `count <= 0`.
 * @param items - The candidate items.
 * @param count - How many to draw.
 * @returns Up to `count` randomly-selected items.
 */
export function shuffleAndTake<T>(items: T[], count: number): T[] {
  if (count <= 0) return [];
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
