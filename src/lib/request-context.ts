import DataLoader from "dataloader";
import { cache } from "react";
import type { QuestionService } from "./question-service";
import { getQuestionService } from "./services-singleton";

/**
 * Request-scoped context holding DataLoader instances.
 *
 * DataLoaders batch and deduplicate `.load(key)` calls that happen
 * within the same tick, then call the underlying batch function once.
 * This eliminates N+1 query patterns without callers needing to know
 * about batching — they just call `loader.load(key)`.
 *
 * Each server render (request) gets its own `RequestContext` via
 * `React.cache()`, ensuring loaders are not shared across requests.
 */
export class RequestContext {
  /** Loads question count for a testId. Auto-batched. */
  readonly questionCountLoader: DataLoader<string, number>;

  constructor(questionService: QuestionService) {
    this.questionCountLoader = new DataLoader(async (testIds) => {
      const counts = await questionService.countByTestIds([...testIds]);
      return testIds.map((id) => counts.get(id) ?? 0);
    });
  }
}

/**
 * Returns a request-scoped `RequestContext`.
 * `React.cache()` guarantees one instance per server render.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const questionService = await getQuestionService();
  return new RequestContext(questionService);
});
