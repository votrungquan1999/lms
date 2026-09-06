import { registerOTel } from "@vercel/otel";

// Next.js calls this once per server runtime (Node + Edge) before handling
// requests. `@vercel/otel` auto-reads the standard OTLP env vars
// (OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS) to export traces
// to Grafana Cloud Tempo — no explicit exporter wiring needed.
export async function register() {
  registerOTel({
    serviceName: "lms",
    // `@vercel/otel` auto-instruments ALL outbound fetch() calls. Drop the
    // framework/infra chatter (Next.js telemetry + npm registry/version checks,
    // mostly dev-only) so traces stay focused on app + API calls. Useful
    // outbound fetches (Gemini, OAuth) are kept.
    instrumentationConfig: {
      fetch: {
        ignoreUrls: [/telemetry\.nextjs\.org/, /registry\.npmjs\.org/],
      },
    },
  });

  // e2e-only: stub the Gemini network call so `dev:e2e` never needs a live
  // API key (D60) — Playwright's `page.route` can't reach it since the call
  // is server-side. Dynamic import keeps `msw` and this handler out of any
  // production bundle. `register()` also runs for the Edge runtime, where
  // msw's Node-only `setupServer` can't run, so it's gated to Node too.
  if (
    process.env.E2E_MOCK_AI === "1" &&
    process.env.NEXT_RUNTIME === "nodejs"
  ) {
    const { startE2eGeminiMock } = await import("src/mocks/e2e-gemini-mock");
    startE2eGeminiMock();
  }
}
