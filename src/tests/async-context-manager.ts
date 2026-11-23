import { AsyncLocalStorage } from "node:async_hooks";
import {
  type Context,
  type ContextManager,
  context,
  ROOT_CONTEXT,
} from "@opentelemetry/api";

/** Keeps the active OTel context across awaits, so `trace.getActiveSpan()` works in tests. */
class AsyncLocalStorageContextManager implements ContextManager {
  private readonly storage = new AsyncLocalStorage<Context>();

  /** The context of the current async flow. */
  active(): Context {
    return this.storage.getStore() ?? ROOT_CONTEXT;
  }

  /**
   * Runs `fn` with `ctx` active.
   * @param ctx - The context to activate.
   * @param fn - The function to run.
   * @param thisArg - `this` for `fn`.
   * @param args - Arguments for `fn`.
   */
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.storage.run(ctx, () => fn.call(thisArg, ...args));
  }

  /**
   * Returns `target` unchanged; tests never bind contexts to callbacks.
   * @param _ctx - Ignored.
   * @param target - Returned as is.
   */
  bind<T>(_ctx: Context, target: T): T {
    return target;
  }

  /** Nothing to start. */
  enable(): this {
    return this;
  }

  /** Nothing to stop. */
  disable(): this {
    return this;
  }
}

/** Registers the manager globally; undo with `context.disable()` in teardown. */
export function registerAsyncContextManager(): void {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
}
