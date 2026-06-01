import {
  type Attributes,
  type Span,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { unstable_rethrow } from "next/navigation";

/**
 * Runs `fn` inside an active OTel span named `name`, attaching `attributes`.
 * On success: sets status OK and returns fn's resolved value.
 * On throw/reject: records the exception, sets status ERROR, and rethrows the
 * SAME error (never swallows). Ends the span in `finally` so it is always
 * exported. This is one of the intentional record-and-rethrow boundaries
 * permitted by the no-defensive-try/catch rule.
 * @param name - The span name (e.g. "action.submitTest", "answer.submit").
 * @param attributes - Allowlisted span attributes (IDs/enums only — never PII).
 * @param fn - The async work to run; receives the live span for enrichment.
 * @returns Promise resolving to fn's resolved value.
 */
export function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("lms");

  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Next control-flow signals (NEXT_REDIRECT, HTTP-access fallbacks like
      // forbidden()/notFound()) are NOT errors — let them escape un-flagged so
      // the span stays UNSET and carries no exception event.
      unstable_rethrow(error);

      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
