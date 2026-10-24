import { describe, expect, it } from "vitest";
import { recordReadSeconds } from "../../e2e/real-ai-read-timing";

describe("recordReadSeconds", () => {
  it("reports the parse round-trip in whole seconds", () => {
    expect(recordReadSeconds(undefined, 1_000, 71_420)).toBe(70);
  });

  it("keeps the parse figure when a later request matches the same route", () => {
    expect(recordReadSeconds(70, 90_000, 90_300)).toBe(70);
  });
});
