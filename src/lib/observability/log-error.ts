/** Trace each error was recorded in — the span has ended by the time an action logs it. */
const errorTraceIds = new WeakMap<object, string>();

/**
 * Remembers which trace an error was recorded in. The first (innermost) span
 * wins; every span of one request shares the trace id anyway.
 * @param error - The error a span just recorded.
 * @param traceId - That span's trace id.
 */
export function noteErrorTrace(error: unknown, traceId: string): void {
  if (typeof error !== "object" || error === null) return;
  if (!errorTraceIds.has(error)) {
    errorTraceIds.set(error, traceId);
  }
}

/**
 * Logs an error caught at an action's error boundary, prefixed with its trace
 * id when a span recorded it, so the log line can be found in Grafana.
 * @param error - Whatever the action caught.
 */
export function logError(error: unknown): void {
  const detail = error instanceof Error ? error.stack : JSON.stringify(error);
  const traceId =
    typeof error === "object" && error !== null
      ? errorTraceIds.get(error)
      : undefined;
  console.error(traceId ? `trace_id=${traceId} ${detail}` : detail);
}
