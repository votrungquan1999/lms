import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { withSpan } from "src/lib/observability/with-span";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let exporter: InMemorySpanExporter;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(() => {
  exporter.reset();
  trace.disable();
});

describe("withSpan", () => {
  it("records an OK span carrying the attributes and returns the resolved value", async () => {
    // Given / When
    const result = await withSpan(
      "test.span",
      { "lms.test.id": "t1" },
      async () => 42,
    );

    // Then
    expect(result).toBe(42);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("test.span");
    expect(spans[0]?.attributes["lms.test.id"]).toBe("t1");
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
  });

  it("records the exception, marks the span ERROR, and rethrows the same error", async () => {
    // Given
    const boom = new Error("kaboom");

    // When / Then — the same error propagates out
    await expect(
      withSpan("test.span", {}, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);

    const exceptionEvent = spans[0]?.events.find(
      (event) => event.name === "exception",
    );
    expect(exceptionEvent).toBeDefined();
    expect(exceptionEvent?.attributes?.["exception.message"]).toBe("kaboom");
  });

  it("lets Next control-flow signals (redirect) pass through without marking the span ERROR", async () => {
    // Given — redirect() throws Next's NEXT_REDIRECT control-flow signal
    const { redirect } = await import("next/navigation");

    // When / Then — the signal still propagates (it must reach Next's handler)
    await expect(
      withSpan("test.span", {}, async () => {
        redirect("/login");
      }),
    ).rejects.toThrow();

    // ...but it is NOT a real error: span must not be ERROR and carry no exception
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(
      spans[0]?.events.find((event) => event.name === "exception"),
    ).toBeUndefined();
  });
});
