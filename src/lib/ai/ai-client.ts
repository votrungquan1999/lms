import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { Span } from "@opentelemetry/api";
import { generateText, Output } from "ai";
import {
  recordAiCall,
  summarizeIdMatch,
  summarizeResult,
} from "src/lib/ai/ai-call-telemetry";
import {
  AiProviderName,
  createAiRequestRecorder,
} from "src/lib/ai/ai-request-recorder";
import { buildGradingPrompt } from "src/lib/ai/grading-prompt";
import { aiGradeBatchSchema } from "src/lib/ai/grading-schema";
import { withSpan } from "src/lib/observability/with-span";

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

/** One multiple-choice option extracted from a document by the LLM. */
export interface ParsedQuestionOption {
  text: string;
  isCorrect: boolean;
}

/**
 * One question the LLM extracted from an uploaded document's plain text.
 * `options` is present only for `single_select` / `multi_select`.
 * `referenceAnswer` / `explanation` are populated only when the source
 * document actually contained them — the model never invents either.
 * `imageNumbers` names the document's pictures this question uses; the import
 * client fills it from the `[image N]` markers the model left in the question's text.
 */
export interface ParsedQuestion {
  title: string;
  content: string;
  type: "free_text" | "single_select" | "multi_select";
  options?: ParsedQuestionOption[];
  referenceAnswer?: string;
  explanation?: string;
  imageNumbers?: number[];
}

/**
 * Pluggable seam for turning a document's extracted text into structured
 * questions. Separate from `AiClient` so grading stubs (like `NoopAiClient`)
 * never have to grow methods they have no business knowing about.
 */
export interface QuestionParseClient {
  /**
   * Extracts structured questions from a document's plain text.
   * @param documentText - The full text extracted client-side from the upload.
   * @param pictureNumbers - The numbers of the pictures the browser really
   *   extracted from the document; none for a PDF.
   * @returns One entry per question found, in document order.
   */
  parseQuestionsFromText(
    documentText: string,
    pictureNumbers?: readonly number[],
  ): Promise<ParsedQuestion[]>;

  /**
   * Re-reads ONE already-extracted question, addressing a teacher's
   * correction note. Only this question is returned.
   * @param documentText - The full text extracted client-side from the upload.
   * @param currentQuestion - The question's current (possibly hand-edited) draft.
   * @param correctionNote - What the teacher says was wrong with it.
   * @returns The corrected question.
   */
  retryQuestion(
    documentText: string,
    currentQuestion: ParsedQuestion,
    correctionNote: string,
  ): Promise<ParsedQuestion>;
}

/** Gemini model id used for every live call unless `GEMINI_MODEL_ID` overrides it. */
const DEFAULT_GEMINI_MODEL_ID = "gemini-3.5-flash";

/**
 * The Gemini model to call — read per call so a run can move off an
 * overloaded default via `GEMINI_MODEL_ID` without a code change.
 * @returns The model id to send to Gemini.
 */
export function geminiModelId(): string {
  return process.env.GEMINI_MODEL_ID || DEFAULT_GEMINI_MODEL_ID;
}

/**
 * Builds the Gemini model around a given `fetch`, so its requests are recorded.
 * @param recordingFetch - The recorder's `fetch`.
 * @returns The language model to hand to `generateText`.
 */
export function geminiModelFor(recordingFetch: typeof fetch) {
  return createGoogleGenerativeAI({ fetch: recordingFetch })(geminiModelId());
}

/**
 * Builds the Gemini model for one operation, routed through the request
 * recorder so every HTTP request it sends is traced.
 * @param span - The operation's span, parent of the request spans.
 * @param operation - The operation name stamped on each record.
 * @returns The language model to hand to `generateText`.
 */
function geminiModel(span: Span, operation: string) {
  const recorder = createAiRequestRecorder({
    span,
    provider: AiProviderName.Gemini,
    operation,
  });
  return geminiModelFor(recorder.fetch);
}

/**
 * Total limit per call, retries included. A 31-question exam took ~2 minutes
 * to read; it must stay under Vercel's 300s function limit (Hobby, Fluid
 * compute) so the failure is still recorded.
 */
export const AI_CALL_TIMEOUT_MS = 240_000;

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
 * `@ai-sdk/google`. Tests inject a deterministic stub through `buildCoreServices`.
 * In Vitest, the setup's fetch guard blocks its requests unless a test stubs fetch.
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
    return withSpan(
      "gemini.gradeFreeTextBatch",
      {
        "gen_ai.request.model": geminiModelId(),
        "gen_ai.operation.name": "generate_content",
        "lms.ai.batch_size": items.length,
        "lms.ai.regenerate": opts !== undefined,
      },
      (span) =>
        recordAiCall(span, async () => {
          const result = await generateText({
            model: geminiModel(span, "gemini.gradeFreeTextBatch"),
            timeout: AI_CALL_TIMEOUT_MS,
            output: Output.object({ schema: aiGradeBatchSchema }),
            prompt: buildGradingPrompt(items, opts),
          });

          const parsed = result.output;
          if (!parsed) {
            throw new Error("Gemini returned no parsed output");
          }
          const grades = parsed.grades.map((g) => ({
            questionId: g.questionId,
            score: g.score,
            feedback: g.feedback,
            solution: g.solution,
          }));
          return {
            value: grades,
            summary: {
              ...summarizeResult(result),
              ...summarizeIdMatch(
                items.map((item) => item.questionId),
                grades.map((grade) => grade.questionId),
              ),
            },
          };
        }),
    );
  }
}
