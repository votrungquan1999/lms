import { createAnthropic } from "@ai-sdk/anthropic";
import type { Span } from "@opentelemetry/api";
import { type FlexibleSchema, generateText, Output } from "ai";
import {
  assertReplyFinished,
  recordAiCall,
  summarizeResult,
} from "src/lib/ai/ai-call-telemetry";
import {
  GEMINI_TIMEOUT_MS,
  geminiModel,
  geminiModelId,
  type ParsedQuestion,
  type QuestionParseClient,
} from "src/lib/ai/ai-client";
import {
  AiProviderName,
  createAiRequestRecorder,
} from "src/lib/ai/ai-request-recorder";
import { separateMarkdownBlocks } from "src/lib/ai/markdown-blocks";
import {
  buildQuestionImportPrompt,
  buildQuestionRetryPrompt,
} from "src/lib/ai/question-import-prompt";
import {
  questionImportBatchSchema,
  questionRetryResultSchema,
} from "src/lib/ai/question-import-schema";
import { withSpan } from "src/lib/observability/with-span";
import { z } from "zod";

/** Which AI provider reads imports; the setting `AI_IMPORT_PROVIDER` picks one. */
enum ImportProvider {
  Claude = "claude",
  Gemini = "gemini",
}

/** Claude model that reads imports unless `CLAUDE_MODEL_ID` overrides it. */
const DEFAULT_CLAUDE_MODEL_ID = "claude-sonnet-5-5";

/** Output cap that fits a 31-question exam reply with room to spare. */
const CLAUDE_MAX_OUTPUT_TOKENS = 32_000;

/** The `AI_IMPORT_PROVIDER` setting; unset or empty means Claude. */
const importProviderSchema = z.preprocess(
  (value) => value || ImportProvider.Claude,
  z.enum(ImportProvider),
);

/**
 * Reads the import provider setting per call so a run can switch without a restart.
 * @returns The provider that reads imports.
 */
function importProvider(): ImportProvider {
  const parsed = importProviderSchema.safeParse(process.env.AI_IMPORT_PROVIDER);
  if (!parsed.success) {
    // A bare ZodError would not name the variable the operator must fix.
    throw new Error(
      `AI_IMPORT_PROVIDER must be one of ${Object.values(ImportProvider).join(", ")}`,
    );
  }
  return parsed.data;
}

/**
 * The Claude model to call, read per call so a run can override it.
 * @returns The Claude model id.
 */
function claudeModelId(): string {
  return process.env.CLAUDE_MODEL_ID || DEFAULT_CLAUDE_MODEL_ID;
}

/** The provider and model one import read goes to. */
interface ImportTarget {
  provider: ImportProvider;
  providerName: AiProviderName;
  modelId: string;
}

/**
 * Resolves where the next import read goes, from the current settings.
 * @returns The provider, its trace name and the model id.
 */
function importTarget(): ImportTarget {
  if (importProvider() === ImportProvider.Gemini) {
    return {
      provider: ImportProvider.Gemini,
      providerName: AiProviderName.Gemini,
      modelId: geminiModelId(),
    };
  }
  return {
    provider: ImportProvider.Claude,
    providerName: AiProviderName.Anthropic,
    modelId: claudeModelId(),
  };
}

/**
 * Span attributes that say which provider and model an import read used.
 * @param target - The resolved provider and model.
 * @returns The provider and model attributes.
 */
function targetAttributes(target: ImportTarget) {
  return {
    "gen_ai.provider.name": target.providerName,
    "gen_ai.request.model": target.modelId,
  };
}

/** What one model call needs: where it traces, what it asks, how it must answer. */
interface CallModelOptions<OUTPUT> {
  target: ImportTarget;
  span: Span;
  operation: string;
  schema: FlexibleSchema<OUTPUT>;
  prompt: string;
}

/**
 * Sends one prompt to the import model and returns the SDK result untouched,
 * so post-processing runs once on whatever result is finally accepted.
 * @param options - The span, operation, answer schema and prompt.
 * @returns The `generateText` result.
 */
function callModel<OUTPUT>(options: CallModelOptions<OUTPUT>) {
  const common = {
    timeout: GEMINI_TIMEOUT_MS,
    output: Output.object({ schema: options.schema }),
    prompt: options.prompt,
  };
  if (options.target.provider === ImportProvider.Gemini) {
    return generateText({
      ...common,
      model: geminiModel(options.span, options.operation),
    });
  }
  const recorder = createAiRequestRecorder({
    span: options.span,
    provider: AiProviderName.Anthropic,
    operation: options.operation,
  });
  return generateText({
    ...common,
    model: createAnthropic({ fetch: recorder.fetch })(options.target.modelId),
    maxOutputTokens: CLAUDE_MAX_OUTPUT_TOKENS,
  });
}

/**
 * Reads exam documents into draft questions through the import model.
 *
 * Errors from the SDK surface uncaught so the action's outer try/catch can
 * show its pinned failure message.
 */
export class ImportAiClient implements QuestionParseClient {
  /**
   * Extracts structured questions from a document's plain text.
   * @param documentText - The full text extracted client-side from the upload.
   * @returns The parsed questions, in document order.
   */
  async parseQuestionsFromText(
    documentText: string,
  ): Promise<ParsedQuestion[]> {
    const target = importTarget();
    return withSpan(
      "import.parseQuestionsFromText",
      {
        ...targetAttributes(target),
        "gen_ai.operation.name": "generate_content",
        "lms.ai.document_text_length": documentText.length,
      },
      (span) =>
        recordAiCall(span, async () => {
          const result = await callModel({
            span,
            target,
            operation: "import.parseQuestionsFromText",
            schema: questionImportBatchSchema,
            prompt: buildQuestionImportPrompt(documentText),
          });

          assertReplyFinished(result);
          const parsed = result.output;
          return {
            value: parsed.questions.map((q) => ({
              title: q.title,
              content: separateMarkdownBlocks(q.content),
              type: q.type,
              options: q.options,
              referenceAnswer: q.referenceAnswer,
              explanation: q.explanation,
              imageNumbers: q.imageNumbers,
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
   * Re-reads one already-extracted question, addressing a teacher's
   * correction note.
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
    const target = importTarget();
    return withSpan(
      "import.retryQuestion",
      {
        ...targetAttributes(target),
        "gen_ai.operation.name": "generate_content",
        "lms.ai.document_text_length": documentText.length,
      },
      (span) =>
        recordAiCall(span, async () => {
          const result = await callModel({
            span,
            target,
            operation: "import.retryQuestion",
            schema: questionRetryResultSchema,
            prompt: buildQuestionRetryPrompt(
              documentText,
              currentQuestion,
              correctionNote,
            ),
          });

          assertReplyFinished(result);
          const parsed = result.output;
          return {
            value: {
              title: parsed.question.title,
              content: separateMarkdownBlocks(parsed.question.content),
              type: parsed.question.type,
              options: parsed.question.options,
              referenceAnswer: parsed.question.referenceAnswer,
              explanation: parsed.question.explanation,
              imageNumbers: parsed.question.imageNumbers,
            },
            summary: summarizeResult(result),
          };
        }),
    );
  }
}
