import { HttpResponse, http } from "msw";
import { type SetupServer, setupServer } from "msw/node";

/**
 * Text this mock returns as a question title. Distinct from anything a real
 * document or a real Gemini reply would contain, so a passing assertion on
 * it in `e2e/import-ai-flow.test.ts` can only mean this mock answered the
 * call — not a real (or accidentally successful) Gemini request.
 */
export const MOCK_QUESTION_TITLE = "MSW mock: Gemini call intercepted";

/** Hosts of the AI providers the LMS calls. */
const AI_PROVIDER_HOSTS = new Set([
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
]);

/** A phrase unique to the e2e spec's generated PDF page text. */
const PDF_TEXT_MARKER = "Explain photosynthesis";

/** Content confirming the real extracted PDF text reached this handler. */
export const PDF_TEXT_RECEIVED_MARKER = "Extracted PDF text reached the mock";

// Matches `.../v1beta/models/<any-model-id>:generateContent` — a colon, not
// a `/`, separates the model id from the method, so this can't be a plain
// path-to-regexp param pattern; match it as a regex instead.
const GEMINI_GENERATE_CONTENT_URL =
  /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent$/;

/**
 * Starts an in-process MSW server that intercepts Gemini's
 * `generateContent` call so `dev:e2e` never needs a live API key. Returns a
 * canned response shaped exactly like `@ai-sdk/google`'s `generateText` +
 * `Output.object` expect: `candidates[0].content.parts[0].text` holding a
 * JSON string that itself matches `questionImportBatchSchema`.
 *
 * Only the e2e harness starts this — see `instrumentation.ts`'s
 * `E2E_MOCK_AI` gate.
 * @returns The running server, so a caller can close it.
 */
export function startE2eAiMock(): SetupServer {
  const server = setupServer(
    http.post(GEMINI_GENERATE_CONTENT_URL, async ({ request }) => {
      const rawBody = await request.text();
      const sawExtractedPdfText = rawBody.includes(PDF_TEXT_MARKER);

      const cannedBatch = {
        questions: [
          {
            title: MOCK_QUESTION_TITLE,
            content: `${PDF_TEXT_RECEIVED_MARKER}: ${sawExtractedPdfText ? "yes" : "no"}`,
            type: "free_text",
          },
        ],
      };

      return HttpResponse.json({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(cannedBatch) }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      });
    }),
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
