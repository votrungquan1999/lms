import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { tracedService } from "src/lib/observability/traced-service";
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

/** Minimal stand-in for a real service — exercises the Proxy contract only. */
class Fake {
  public readonly label = "plain";

  async getValue(): Promise<number> {
    return 42;
  }

  syncFlag(): boolean {
    return true;
  }

  async outer(): Promise<string> {
    return this.inner();
  }

  async inner(): Promise<string> {
    return "inner";
  }

  async boom(): Promise<never> {
    throw new Error("kaboom");
  }
}

describe("tracedService", () => {
  it("wraps a method call in a `<name>.<method>` span and preserves its return value", async () => {
    // Given
    const proxy = tracedService(new Fake(), "fake");

    // When
    const result = await proxy.getValue();

    // Then
    expect(result).toBe(42);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("fake.getValue");
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
  });

  it("passes non-function properties through unchanged and emits no span", () => {
    // Given
    const proxy = tracedService(new Fake(), "fake");

    // When
    const label = proxy.label;

    // Then
    expect(label).toBe("plain");
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  // The proxy delegates to the async `withSpan`, so a wrapped method always
  // returns a Promise. This is safe: the only public sync service method
  // (AuthService.isAdminEmail) is called internally via `this` (bound to the
  // raw target), never externally through the proxy — so preserving a
  // synchronous return shape would be an unused feature. This test locks that
  // a non-promise return value is still resolved correctly and spanned.
  it("resolves a non-promise return value through the span and marks it OK", async () => {
    // Given
    const proxy = tracedService(new Fake(), "fake");

    // When
    const flag = await proxy.syncFlag();

    // Then
    expect(flag).toBe(true);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("fake.syncFlag");
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
  });

  it("rethrows a method's error and marks its span ERROR with an exception event", async () => {
    // Given
    const proxy = tracedService(new Fake(), "fake");

    // When / Then
    await expect(proxy.boom()).rejects.toThrow("kaboom");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("fake.boom");
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(
      spans[0]?.events.find((event) => event.name === "exception"),
    ).toBeDefined();
  });

  it("binds wrapped methods to the target so internal `this.method()` calls are not double-spanned", async () => {
    // Given
    const proxy = tracedService(new Fake(), "fake");

    // When — outer() internally calls this.inner()
    const result = await proxy.outer();

    // Then — only the outer call is spanned; the internal this.inner() hit the
    // raw target, so there is exactly one span and no `fake.inner` span.
    expect(result).toBe("inner");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("fake.outer");
    expect(spans.map((span) => span.name)).not.toContain("fake.inner");
  });
});
