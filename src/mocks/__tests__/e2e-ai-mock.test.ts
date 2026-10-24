import type { SetupServer } from "msw/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startE2eAiMock } from "../e2e-ai-mock";

let server: SetupServer | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
  vi.unstubAllGlobals();
});

describe("e2e AI mock", () => {
  it("fails an AI provider request it has no answer for instead of letting it out", async () => {
    // Given a stand-in for the network the mock would fall through to
    const network = vi.fn(async () => new Response("reached the network"));
    vi.stubGlobal("fetch", network);
    server = startE2eAiMock();

    // When a provider request nobody mocked is sent
    const response = await fetch(
      "https://api.anthropic.com/v1/messages/count_tokens",
      { method: "POST" },
    );

    // Then it is answered with an error and never reaches the network
    expect(response.ok).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });

  it("lets requests to other hosts through untouched", async () => {
    // Given the same stand-in network
    const network = vi.fn(async () => new Response("reached the network"));
    vi.stubGlobal("fetch", network);
    server = startE2eAiMock();

    // When a non-AI request is sent
    const response = await fetch("https://telemetry.example.com/v1/traces");

    // Then it passes through
    expect(await response.text()).toBe("reached the network");
  });
});
