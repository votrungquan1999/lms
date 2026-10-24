import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../../playwright.config";

/** The suite's single web server entry. */
function webServer(loaded: typeof config = config) {
  const server = loaded.webServer;
  if (!server || Array.isArray(server)) throw new Error("expected one server");
  return server;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mocked e2e server", () => {
  it("always starts its own server, so a leftover dev server can't serve the suite real AI calls", () => {
    expect(webServer().reuseExistingServer).toBe(false);
  });

  it("hands the server this run's id, keeping one the caller already set", async () => {
    // Given a caller that already chose the run id
    vi.stubEnv("AI_USAGE_RUN_ID", "run-from-caller");
    vi.resetModules();

    // When the config loads
    const loaded = (await import("../../../playwright.config")).default;

    // Then the server's usage records are tagged with that id
    expect(webServer(loaded).env?.AI_USAGE_RUN_ID).toBe("run-from-caller");
  });

  it("makes up a run id when the caller sets none, and shares it with the server", async () => {
    // Given no run id in the environment
    vi.stubEnv("AI_USAGE_RUN_ID", "");
    delete process.env.AI_USAGE_RUN_ID;
    vi.resetModules();

    // When the config loads
    const loaded = (await import("../../../playwright.config")).default;

    // Then the server gets the same fresh id the test process now holds
    const runId = webServer(loaded).env?.AI_USAGE_RUN_ID;
    expect(runId).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(runId).toBe(process.env.AI_USAGE_RUN_ID);
  });
});
