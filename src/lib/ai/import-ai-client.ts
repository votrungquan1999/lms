import { createAnthropic } from "@ai-sdk/anthropic";
import type { Span } from "@opentelemetry/api";
import {
  type FlexibleSchema,
  generateText,
  Output,
  type ProviderMetadata,
} from "ai";
import {
  assertReplyFinished,
  keepEarlierResults,
  RefusalError,
  recordAiCall,
  summarizeResults,
} from "src/lib/ai/ai-call-telemetry";
import { AI_CALL_TIMEOUT_MS } from "src/lib/ai/ai-call-timeout";
import {
  geminiModelFor,
  geminiModelId,
  type ParsedQuestion,
  type QuestionParseClient,
} from "src/lib/ai/ai-client";
import {
  AiProviderName,
  type AiRequestRecorder,
  createAiRequestRecorder,
} from "src/lib/ai/ai-request-recorder";
import { separateMarkdownBlocks } from "src/lib/ai/markdown-blocks";
import { readPictureMarkers } from "src/lib/ai/picture-markers";
import {
  buildQuestionImportPrompt,
  buildQuestionRetryPrompt,
} from "src/lib/ai/question-import-prompt";
import {
  type QuestionImportItem,
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

/** Claude model that re-reads a document Sonnet refused. */
const REREAD_MODEL_ID = "claude-haiku-4-5";

/** Total time one read may take, a refusal's re-read included. */
const READ_TIME_BUDGET_MS = AI_CALL_TIMEOUT_MS;

/** Below this much remaining budget a re-read cannot finish, so none starts. */
const MIN_REREAD_MS = 10_000;

/** The `AI_IMPORT_PROVIDER` setting; unset or empty means Claude. */
const importProviderSchema = z.preprocess(
  (value) => value || ImportProvider.Claude,
  z.enum(ImportProvider),
);

/** The `AI_IMPORT_PROVIDER` setting holds a value no provider answers to. */
export class ImportProviderSettingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportProviderSettingError";
  }
}

/**
 * Reads the import provider setting per call so a run can switch without a restart.
 * @returns The provider that reads imports.
 */
function importProvider(): ImportProvider {
  const parsed = importProviderSchema.safeParse(process.env.AI_IMPORT_PROVIDER);
  if (!parsed.success) {
    // A bare ZodError would not name the variable the operator must fix.
    throw new ImportProviderSettingError(
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

/** What one model request needs: where it goes, what it asks, how it must answer. */
interface CallModelOptions<OUTPUT> {
  provider: ImportProvider;
  modelId: string;
  recorder: AiRequestRecorder;
  timeoutMs: number;
  schema: FlexibleSchema<OUTPUT>;
  prompt: string;
}

/**
 * Sends one prompt to a model and returns the SDK result untouched, so
 * post-processing runs once on whatever result is finally accepted.
 * @param options - The target, recorder, time limit, answer schema and prompt.
 * @returns The `generateText` result.
 */
function callModel<OUTPUT>(options: CallModelOptions<OUTPUT>) {
  const common = {
    timeout: options.timeoutMs,
    output: Output.object({ schema: options.schema }),
    prompt: options.prompt,
  };
  if (options.provider === ImportProvider.Gemini) {
    return generateText({
      ...common,
      model: geminiModelFor(options.recorder.fetch),
    });
  }
  return generateText({
    ...common,
    model: createAnthropic({ fetch: options.recorder.fetch })(options.modelId),
    maxOutputTokens: CLAUDE_MAX_OUTPUT_TOKENS,
  });
}

/** What one document read needs, before a model is chosen for each attempt. */
interface ReadModelOptions<OUTPUT> {
  target: ImportTarget;
  span: Span;
  operation: string;
  schema: FlexibleSchema<OUTPUT>;
  prompt: string;
}

/** The accepted result of a read and every result the read produced. */
interface ModelRead<RESULT> {
  result: RESULT;
  results: RESULT[];
}

/**
 * Reads with the chosen model; a Claude refusal is read once more on Haiku
 * within what is left of the read's time budget.
 * @param options - The target, span, operation, answer schema and prompt.
 * @returns The accepted result plus every result, for token totals.
 * @throws RefusalError when the model refuses and no re-read can follow.
 */
async function readModel<OUTPUT>(options: ReadModelOptions<OUTPUT>) {
  const { target } = options;
  const startedAt = Date.now();
  const recorder = createAiRequestRecorder({
    span: options.span,
    provider: target.providerName,
    operation: options.operation,
  });
  const request = {
    schema: options.schema,
    prompt: options.prompt,
  };
  const first = await callModel({
    ...request,
    provider: target.provider,
    modelId: target.modelId,
    recorder,
    timeoutMs: READ_TIME_BUDGET_MS,
  });
  const isClaude = target.provider === ImportProvider.Claude;
  if (!isClaude || first.finishReason !== "content-filter") {
    assertReplyFinished(first);
    return { result: first, results: [first] } satisfies ModelRead<
      typeof first
    >;
  }

  // Claude refused: one re-read on another model, if time and model allow.
  const remainingMs = READ_TIME_BUDGET_MS - (Date.now() - startedAt);
  if (target.modelId === REREAD_MODEL_ID || remainingMs < MIN_REREAD_MS) {
    throw new RefusalError(refusalCategory(first), [first]);
  }
  const second = await callModel({
    ...request,
    provider: target.provider,
    modelId: REREAD_MODEL_ID,
    recorder: recorder.withReason("refusal_retry"),
    timeoutMs: remainingMs,
  }).catch((error: unknown) => {
    // The refused request was paid for, so the span keeps its tokens.
    throw keepEarlierResults(error, [first]);
  });
  if (second.finishReason === "content-filter") {
    throw new RefusalError(refusalCategory(second), [first, second]);
  }
  assertReplyFinished(second, [first]);
  return {
    result: second,
    results: [first, second],
  } satisfies ModelRead<typeof second>;
}

/**
 * Reads the refusal category Claude reported on a refused result.
 * @param result - A result that finished with `content-filter`.
 * @returns The category, when Claude named one.
 */
function refusalCategory(result: {
  providerMetadata?: ProviderMetadata;
}): string | undefined {
  const details = result.providerMetadata?.anthropic?.stopDetails;
  const category = (details as { category?: unknown } | undefined)?.category;
  return typeof category === "string" ? category : undefined;
}

/**
 * Turns one question of a model reply into a draft: pictures come from the
 * markers the model left in its text, then the Markdown is tidied.
 * @param reply - The question as the model wrote it.
 * @param documentPictures - The picture numbers the document really has.
 * @returns The draft question.
 */
function toDraft(
  reply: QuestionImportItem,
  documentPictures: readonly number[],
): ParsedQuestion {
  // Markers must go before the Markdown clean-up, which would treat them as text.
  const read = readPictureMarkers(reply, documentPictures);
  return {
    title: read.title,
    content: separateMarkdownBlocks(read.content),
    type: read.type,
    options: read.options,
    referenceAnswer: read.referenceAnswer,
    explanation: read.explanation,
    imageNumbers: read.imageNumbers,
  };
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
   * @param pictureNumbers - The numbers of the pictures the browser really
   *   extracted; none for a PDF.
   * @returns The parsed questions, in document order.
   */
  async parseQuestionsFromText(
    documentText: string,
    pictureNumbers: readonly number[] = [],
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
          const { result, results } = await readModel({
            span,
            target,
            operation: "import.parseQuestionsFromText",
            schema: questionImportBatchSchema,
            prompt: buildQuestionImportPrompt(documentText),
          });

          const parsed = result.output;
          // The browser's own list: a marker typed into the text is not a picture.
          const documentPictures = [...new Set(pictureNumbers)];
          const drafts = parsed.questions.map((q) =>
            toDraft(q, documentPictures),
          );
          // Counted from the final drafts, so a re-read after a refusal is included.
          const attached = new Set(drafts.flatMap((d) => d.imageNumbers ?? []));
          return {
            value: drafts,
            summary: {
              ...summarizeResults(results),
              questionsReturned: parsed.questions.length,
              picturesInDocument: documentPictures.length,
              picturesAttached: attached.size,
              picturesUnused: documentPictures.length - attached.size,
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
   * @returns The corrected question, without pictures: a re-read never changes them.
   */
  async retryQuestion(
    documentText: string,
    currentQuestion: ParsedQuestion,
    correctionNote: string,
  ): Promise<Omit<ParsedQuestion, "imageNumbers">> {
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
          const { result, results } = await readModel({
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

          // No picture numbers: the reply's markers are stripped, never attached.
          const { imageNumbers: _pictures, ...question } = toDraft(
            result.output.question,
            [],
          );
          return {
            value: question,
            summary: summarizeResults(results),
          };
        }),
    );
  }
}
