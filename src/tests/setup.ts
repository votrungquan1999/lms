import "@testing-library/jest-dom/vitest";

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
