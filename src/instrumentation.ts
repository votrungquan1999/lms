import { registerOTel } from "@vercel/otel";

// Next.js calls this once per server runtime (Node + Edge) before handling
// requests. `@vercel/otel` auto-reads the standard OTLP env vars
// (OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS) to export traces
// to Grafana Cloud Tempo — no explicit exporter wiring needed.
export function register() {
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
}
