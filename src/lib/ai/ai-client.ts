import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import {
  recordAiCall,
  summarizeIdMatch,
  summarizeResult,
} from "src/lib/ai/ai-call-telemetry";
import { buildGradingPrompt } from "src/lib/ai/grading-prompt";
import { aiGradeBatchSchema } from "src/lib/ai/grading-schema";
import {
  buildQuestionImportPrompt,
  buildQuestionRetryPrompt,
} from "src/lib/ai/question-import-prompt";
import {
  questionImportBatchSchema,
  questionRetryResultSchema,
} from "src/lib/ai/question-import-schema";
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
 */
export interface ParsedQuestion {
  title: string;
  content: string;
  type: "free_text" | "single_select" | "multi_select";
  options?: ParsedQuestionOption[];
  referenceAnswer?: string;
  explanation?: string;
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
   * @returns One entry per question found, in document order.
   */
  parseQuestionsFromText(documentText: string): Promise<ParsedQuestion[]>;

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

/** Gemini model id used for the live grading path. */
const GEMINI_MODEL_ID = "gemini-3.5-flash";

/** Total limit per call, retries included — must stay under the platform's function limit so the failure is recorded. */
const GEMINI_TIMEOUT_MS = 120_000;

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
export class GeminiAiClient implements AiClient, QuestionParseClient {
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
        "gen_ai.request.model": GEMINI_MODEL_ID,
        "gen_ai.operation.name": "generate_content",
        "lms.ai.batch_size": items.length,
        "lms.ai.regenerate": opts !== undefined,
      },
      (span) =>
        recordAiCall(span, async () => {
          const result = await generateText({
            model: google(GEMINI_MODEL_ID),
            timeout: GEMINI_TIMEOUT_MS,
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

  /**
   * Extracts structured questions from a document's plain text via Gemini.
   * @param documentText - The full text extracted client-side from the upload.
   * @returns The parsed questions, in document order.
   */
  async parseQuestionsFromText(
    documentText: string,
  ): Promise<ParsedQuestion[]> {
    return withSpan(
      "gemini.parseQuestionsFromText",
      {
        "gen_ai.request.model": GEMINI_MODEL_ID,
        "gen_ai.operation.name": "generate_content",
        "lms.ai.document_text_length": documentText.length,
      },
      (span) =>
        recordAiCall(span, async () => {
          const result = await generateText({
            model: google(GEMINI_MODEL_ID),
            timeout: GEMINI_TIMEOUT_MS,
            output: Output.object({ schema: questionImportBatchSchema }),
            prompt: buildQuestionImportPrompt(documentText),
          });

          const parsed = result.output;
          if (!parsed) {
            throw new Error("Gemini returned no parsed output");
          }
          return {
            value: parsed.questions.map((q) => ({
              title: q.title,
              content: q.content,
              type: q.type,
              options: q.options,
              referenceAnswer: q.referenceAnswer,
              explanation: q.explanation,
            })),
            summary: {
              ...summarizeResult(result),
              questionsReturned: parsed.questions.length,
            },
          };
        }),
    );
  }

  /**
   * Re-reads one already-extracted question via Gemini, addressing a
   * teacher's correction note.
   * @param documentText - The full text extracted client-side from the upload.
   * @param currentQuestion - The question's current (possibly hand-edited) draft.
   * @param correctionNote - What the teacher says was wrong with it.
   * @returns The corrected question.
   */
  async retryQuestion(
    documentText: string,
    currentQuestion: ParsedQuestion,
    correctionNote: string,
  ): Promise<ParsedQuestion> {
    return withSpan(
      "gemini.retryQuestion",
      {
        "gen_ai.request.model": GEMINI_MODEL_ID,
        "gen_ai.operation.name": "generate_content",
        "lms.ai.document_text_length": documentText.length,
      },
      (span) =>
        recordAiCall(span, async () => {
          const result = await generateText({
            model: google(GEMINI_MODEL_ID),
            timeout: GEMINI_TIMEOUT_MS,
            output: Output.object({ schema: questionRetryResultSchema }),
            prompt: buildQuestionRetryPrompt(
              documentText,
              currentQuestion,
              correctionNote,
            ),
          });

          const parsed = result.output;
          if (!parsed) {
            throw new Error("Gemini returned no parsed output");
          }
          return {
            value: {
              title: parsed.question.title,
              content: parsed.question.content,
              type: parsed.question.type,
              options: parsed.question.options,
              referenceAnswer: parsed.question.referenceAnswer,
              explanation: parsed.question.explanation,
            },
            summary: summarizeResult(result),
          };
        }),
    );
  }
}
