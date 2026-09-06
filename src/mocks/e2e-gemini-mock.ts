import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

/**
 * Text this mock returns as a question title. Distinct from anything a real
 * document or a real Gemini reply would contain, so a passing assertion on
 * it in `e2e/import-ai-flow.test.ts` can only mean this mock answered the
 * call — not a real (or accidentally successful) Gemini request.
 */
export const MOCK_QUESTION_TITLE = "MSW mock: Gemini call intercepted";

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
 */
export function startE2eGeminiMock(): void {
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

  // Any other outbound call in this process (OTel export, Next telemetry,
  // MongoDB driver's own network I/O bypasses http/https anyway) must pass
  // through untouched rather than warn on every unmatched request.
  server.listen({ onUnhandledRequest: "bypass" });
}
