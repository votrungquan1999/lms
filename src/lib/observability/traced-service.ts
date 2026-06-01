import { withSpan } from "src/lib/observability/with-span";

/**
 * Wraps a service instance in a Proxy that auto-spans every method call as
 * `<name>.<method>`, delegating to {@link withSpan}. Non-function properties
 * pass through unchanged. Wrapped methods are bound to the underlying target so
 * internal `this.otherMethod()` calls hit the raw instance (no double-spanning).
 * Preserves the input type `T`.
 * @param instance - The already-constructed service instance to wrap.
 * @param name - Span-name prefix for the service (e.g. "enrollment", "auth").
 * @returns A Proxy of `instance` with the same type that emits per-method spans.
 */
export function tracedService<T extends object>(instance: T, name: string): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== "function") {
        return value;
      }

      const original = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown =>
        withSpan(`${name}.${String(prop)}`, {}, async () =>
          original.apply(target, args),
        );
    },
  }) as T;
}
