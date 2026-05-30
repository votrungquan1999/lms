import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { buildGradingPrompt } from "src/lib/ai/grading-prompt";
import { aiGradeBatchSchema } from "src/lib/ai/grading-schema";

/**
 * Input for one item in an AI free-text grading batch.
 */
export interface AiGradeBatchInput {
  questionId: string;
  questionContent: string;
  studentAnswer: string;
}

/**
 * Output for one item from an AI free-text grading batch.
 *
 * `solution` is a minimally-edited corrected version of the student's
 * submission produced by the model. The student-facing UI renders this as
 * the "correct answer" side of the side-by-side diff once the suggestion is
 * applied to the canonical grade row. It is optional: the model omits it for
 * a fully-correct (score 100) answer, so a perfect score carries no solution.
 */
export interface AiGradeBatchOutput {
  questionId: string;
  score: number;
  feedback: string;
  solution?: string;
}

/**
 * Prior grade snapshot passed to the AI client on regenerate so the LLM can
 * see what was suggested before and adjust accordingly. One entry per
 * candidate question that already had a prior suggestion. `solution` is
 * optional because legacy suggestions written before the solution field
 * shipped have no prior solution to forward.
 */
export interface AiGradeBatchPriorGrade {
  questionId: string;
  score: number;
  feedback: string;
  solution?: string;
}

/**
 * Optional second argument to `gradeFreeTextBatch`. Populated on regenerate
 * with the teacher's reason and the prior grade per question; omitted on
 * initial generation.
 */
export interface AiGradeBatchOptions {
  reason?: string;
  priorGrades?: AiGradeBatchPriorGrade[];
}

/**
 * Pluggable seam between AiGradeService and a concrete LLM wrapper.
 *
 * The real implementation calls Gemini via the Vercel AI SDK. Tests inject a
 * deterministic stub through buildCoreServices so the service-level test path
 * never touches the network.
 */
export interface AiClient {
  /**
   * Grades a batch of free-text answers in a single LLM call.
   * @param items - One entry per candidate question. Order is not significant.
   * @param opts - Optional regenerate context: teacher reason + prior grades.
   * @returns A result row per input item, matched by questionId.
   */
  gradeFreeTextBatch(
    items: AiGradeBatchInput[],
    opts?: AiGradeBatchOptions,
  ): Promise<AiGradeBatchOutput[]>;
}

/** Gemini model id used for the live grading path. */
const GEMINI_MODEL_ID = "gemini-2.5-flash";

/**
 * Live Gemini-backed `AiClient` implementation.
 *
 * Uses the Vercel AI SDK v6 `generateText({ output: Output.object({ schema }) })`
 * pattern with a Zod schema. The SDK validates the model's JSON output against
 * the schema and throws `AI_NoObjectGeneratedError` if it fails — that error
 * surfaces uncaught here so the action's outer try/catch can convert it to the
 * pinned user-facing message. No defensive try/catch lives in this wrapper.
 *
 * Reads `GOOGLE_GENERATIVE_AI_API_KEY` from the environment automatically via
 * `@ai-sdk/google`. Tests inject a deterministic stub through `buildCoreServices`
 * so this implementation is never invoked in the test suite.
 */
export class GeminiAiClient implements AiClient {
  /**
   * Grades one batch of free-text answers via the Gemini API.
   * @param items - One entry per candidate question.
   * @param opts - Optional regenerate context.
   * @returns The parsed, Zod-validated grades, one per input item.
   */
  async gradeFreeTextBatch(
    items: AiGradeBatchInput[],
    opts?: AiGradeBatchOptions,
  ): Promise<AiGradeBatchOutput[]> {
    const result = await generateText({
      model: google(GEMINI_MODEL_ID),
      output: Output.object({ schema: aiGradeBatchSchema }),
      prompt: buildGradingPrompt(items, opts),
    });

    const parsed = result.output;
    if (!parsed) {
      throw new Error("Gemini returned no parsed output");
    }
    return parsed.grades.map((g) => ({
      questionId: g.questionId,
      score: g.score,
      feedback: g.feedback,
      solution: g.solution,
    }));
  }
}
