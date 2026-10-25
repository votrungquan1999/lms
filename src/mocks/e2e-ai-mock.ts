import { HttpResponse, http } from "msw";
import { type SetupServer, setupServer } from "msw/node";

/**
 * Text this mock returns as a question title. Distinct from anything a real
 * document or a real AI reply would contain, so a passing assertion on
 * it in `e2e/import-ai-flow.test.ts` can only mean this mock answered the
 * call — not a real (or accidentally successful) AI request.
 */
export const MOCK_QUESTION_TITLE = "MSW mock: AI call intercepted";

/** Hosts of the AI providers the LMS calls. */
const AI_PROVIDER_HOSTS = new Set([
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
]);

/** A phrase unique to the e2e spec's generated PDF page text. */
const PDF_TEXT_MARKER = "Explain photosynthesis";

/** Content confirming the real extracted PDF text reached this handler. */
export const PDF_TEXT_RECEIVED_MARKER = "Extracted PDF text reached the mock";

/** A phrase only the pictures `.docx` fixture's first question holds, so no other prompt takes this branch. */
const PICTURES_DOCX_MARKER = "Quan sát hình bên";

/** A phrase only the long-text PDF holds, so only that document gets an unbroken title and text. */
const LONG_TEXT_MARKER = "Unbroken text case";

/** One long run with no spaces (like an email or URL) to test card wrapping. */
export const MOCK_UNBROKEN_TEXT = `${"a".repeat(240)}@example.com`;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

// Matches `.../v1beta/models/<any-model-id>:generateContent` — a colon, not
// a `/`, separates the model id from the method, so this can't be a plain
// path-to-regexp param pattern; match it as a regex instead.
const GEMINI_GENERATE_CONTENT_URL =
  /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent$/;

/**
 * Builds the canned question batch both providers' replies carry.
 * @param request - The intercepted request; its body says whether the
 *   extracted PDF text arrived.
 * @returns The JSON text of a batch matching `questionImportBatchSchema`.
 */
async function cannedBatchText(request: Request): Promise<string> {
  const body = await request.text();
  if (body.includes(PICTURES_DOCX_MARKER)) {
    // Keeps picture 1's marker in the text and never mentions picture 2.
    return JSON.stringify({
      questions: [
        {
          title: "Câu 1",
          content: "[image 1]Quan sát hình bên.",
          type: "free_text",
        },
      ],
    });
  }
  if (body.includes(LONG_TEXT_MARKER)) {
    return JSON.stringify({
      questions: [
        {
          title: MOCK_UNBROKEN_TEXT,
          content: MOCK_UNBROKEN_TEXT,
          type: "free_text",
          referenceAnswer: MOCK_UNBROKEN_TEXT,
        },
      ],
    });
  }
  const sawExtractedPdfText = body.includes(PDF_TEXT_MARKER);
  return JSON.stringify({
    questions: [
      {
        title: MOCK_QUESTION_TITLE,
        content: `${PDF_TEXT_RECEIVED_MARKER}: ${sawExtractedPdfText ? "yes" : "no"}`,
        type: "free_text",
      },
    ],
  });
}

/**
 * Starts an in-process MSW server that answers the AI providers' import
 * calls so `dev:e2e` never needs a live API key. Gemini's reply is shaped as
 * `@ai-sdk/google`'s `generateText` + `Output.object` expect it; Claude's as
 * the Messages API returns it. Both carry a JSON batch matching
 * `questionImportBatchSchema`.
 *
 * Only the e2e harness starts this — see `instrumentation.ts`'s
 * `E2E_MOCK_AI` gate.
 * @returns The running server, so a caller can close it.
 */
export function startE2eAiMock(): SetupServer {
  const server = setupServer(
    http.post(GEMINI_GENERATE_CONTENT_URL, async ({ request }) =>
      HttpResponse.json({
        candidates: [
          {
            content: {
              parts: [{ text: await cannedBatchText(request) }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
    ),
    http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) =>
      HttpResponse.json(
        {
          id: "msg_e2e_mock",
          type: "message",
          role: "assistant",
          model: "claude-e2e-mock",
          content: [{ type: "text", text: await cannedBatchText(request) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
        { headers: { "request-id": "req_e2e_mock" } },
      ),
    ),
  );

  // An AI provider request the handlers don't answer must fail, not reach the
  // real provider. Any other call (OTel export, Next telemetry) passes through.
  server.listen({
    onUnhandledRequest: (request) => {
      if (AI_PROVIDER_HOSTS.has(new URL(request.url).host)) {
        // MSW turns a thrown error into a 500 reply, so the call fails loudly.
        throw new Error(`Unmocked AI request ${request.url}`);
      }
    },
  });
  return server;
}
