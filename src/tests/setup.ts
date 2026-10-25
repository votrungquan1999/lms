import "@testing-library/jest-dom/vitest";
import { hardenAiEnvironment } from "./harden-ai-environment";

// jsdom does not implement ResizeObserver. Radix UI primitives (used by shadcn
// Tabs/Popover/etc.) read it on mount, so we provide a minimal stub here so
// server-page render tests can render Radix-using subtrees without crashing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no matchMedia; the sidebar's mobile hook reads it on mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Test runs never reach a real AI provider: the environment is hardened and a
// fetch guard rejects provider hosts.
hardenAiEnvironment();

const AI_PROVIDER_HOSTS = new Set([
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
]);
const realFetch = globalThis.fetch;

/**
 * Fetch for test runs: throws on AI provider hosts, delegates everything else.
 * A plain Error is not retried by the AI SDK, so the failure is immediate.
 * @param input - The request target.
 * @param init - The request options.
 * @returns The real fetch's response for non-provider hosts.
 */
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (AI_PROVIDER_HOSTS.has(url.host)) {
    throw new Error(`Blocked request to AI provider ${url.host} in a test run`);
  }
  return realFetch(input, init);
};
