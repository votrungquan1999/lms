import { trace } from "@opentelemetry/api";
import { logError } from "src/lib/observability/log-error";
import { withSpan } from "src/lib/observability/with-span";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logError", () => {
  it("prints no trace id when tracing is off, rather than the all-zero placeholder", async () => {
    // Given — no tracer provider, so spans carry OTel's invalid placeholder id.
    trace.disable();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("boom");

    // When
    await withSpan("test.span", {}, async () => {
      throw error;
    }).catch(logError);

    // Then
    expect(consoleError).toHaveBeenCalledWith(error.stack);
  });
});
