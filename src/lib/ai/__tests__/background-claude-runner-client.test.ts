import {
  BackgroundClaudeRunnerClient,
  RunnerCreateOutcomeKind,
} from "src/lib/ai/background-claude-runner-client";
import { describe, expect, it, vi } from "vitest";

const SETTINGS = { url: "https://runner.test", key: "bcr_svc_key" };
const JOB_ID = "0123456789abcdef01234567";

/** Builds a client whose fetch is the given fake. */
function clientWith(fetchFake: typeof globalThis.fetch) {
  return new BackgroundClaudeRunnerClient(SETTINGS, {
    fetch: fetchFake,
    timeoutMs: { create: 50, read: 50 },
  });
}

describe("Feature: the runner client classifies the answer to a job create", () => {
  it("returns the job id when the runner answers 201 with a readable body", async () => {
    const client = clientWith(
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: JOB_ID }), { status: 201 }),
      ),
    );

    expect(await client.createJob("prompt")).toEqual({
      kind: RunnerCreateOutcomeKind.Created,
      jobId: JOB_ID,
    });
  });

  it("is unreachable with a status cause when the runner answers anything but 201", async () => {
    const client = clientWith(
      vi.fn(async () => new Response("down", { status: 503 })),
    );

    expect(await client.createJob("prompt")).toEqual({
      kind: RunnerCreateOutcomeKind.Unreachable,
      cause: "status_503",
    });
  });

  it("is unreachable with a bad_body cause when a 201 body is not the create reply", async () => {
    const client = clientWith(
      vi.fn(async () => new Response("not json", { status: 201 })),
    );

    expect(await client.createJob("prompt")).toEqual({
      kind: RunnerCreateOutcomeKind.Unreachable,
      cause: "bad_body",
    });
  });

  it("is unreachable when the network fails, naming the error type but not its message", async () => {
    const client = clientWith(
      vi.fn(async () => {
        throw new TypeError("fetch failed for https://runner.test");
      }),
    );

    const outcome = await client.createJob("prompt");

    expect(outcome).toEqual({
      kind: RunnerCreateOutcomeKind.Unreachable,
      cause: "TypeError",
    });
  });

  it("is unreachable with TimeoutError when the runner does not answer in time", async () => {
    const client = clientWith(
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    expect(await client.createJob("prompt")).toEqual({
      kind: RunnerCreateOutcomeKind.Unreachable,
      cause: "TimeoutError",
    });
  });

  it("rethrows any other failure so a blocked request fails loudly instead of falling back", async () => {
    const client = clientWith(
      vi.fn(async () => {
        throw new Error("Blocked request to AI provider");
      }),
    );

    await expect(client.createJob("prompt")).rejects.toThrow("Blocked request");
  });
});
