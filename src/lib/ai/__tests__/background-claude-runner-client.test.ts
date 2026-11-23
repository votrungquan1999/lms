import {
  BackgroundClaudeRunnerClient,
  RunnerCreateOutcomeKind,
  RunnerReadOutcomeKind,
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

describe("Feature: the runner client classifies the answer to a job read", () => {
  it("returns the status from a status read, asking with the key", async () => {
    const fetchFake = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: "running" }), { status: 200 }),
    );

    const outcome = await clientWith(fetchFake).readStatus(JOB_ID);

    expect(outcome).toEqual({
      kind: RunnerReadOutcomeKind.Found,
      body: { status: "running" },
    });
    expect(String(fetchFake.mock.calls[0]?.[0])).toBe(
      `${SETTINGS.url}/api/jobs/${JOB_ID}?view=status`,
    );
    expect(
      new Headers(fetchFake.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe(`Bearer ${SETTINGS.key}`);
  });

  it("returns the full job with its result text from a job read", async () => {
    const job = {
      id: JOB_ID,
      status: "succeeded",
      result: { text: "{}", durationMs: 1, numTurns: 1, sessionId: "s" },
      error: null,
    };
    const client = clientWith(
      vi.fn(async () => new Response(JSON.stringify(job), { status: 200 })),
    );

    expect(await client.readJob(JOB_ID)).toEqual({
      kind: RunnerReadOutcomeKind.Found,
      body: {
        id: JOB_ID,
        status: "succeeded",
        result: { text: "{}" },
        error: null,
      },
    });
  });

  it("is not found when the runner answers 404", async () => {
    const client = clientWith(
      vi.fn(async () => new Response('{"error":"not found"}', { status: 404 })),
    );

    expect(await client.readJob(JOB_ID)).toEqual({
      kind: RunnerReadOutcomeKind.NotFound,
    });
  });

  it.each([401, 403])(
    "is refused with the status when the runner answers %i",
    async (status) => {
      const client = clientWith(
        vi.fn(async () => new Response("no", { status })),
      );

      expect(await client.readStatus(JOB_ID)).toEqual({
        kind: RunnerReadOutcomeKind.Refused,
        status,
      });
    },
  );

  it("is unreachable with a status cause on a 5xx", async () => {
    const client = clientWith(
      vi.fn(async () => new Response("down", { status: 502 })),
    );

    expect(await client.readStatus(JOB_ID)).toEqual({
      kind: RunnerReadOutcomeKind.Unreachable,
      cause: "status_502",
    });
  });

  it("is unreachable with a bad_body cause when a 200 body is not a job", async () => {
    const client = clientWith(
      vi.fn(async () => new Response('{"nope":1}', { status: 200 })),
    );

    expect(await client.readJob(JOB_ID)).toEqual({
      kind: RunnerReadOutcomeKind.Unreachable,
      cause: "bad_body",
    });
  });

  it("is unreachable when the read times out", async () => {
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

    expect(await client.readStatus(JOB_ID)).toEqual({
      kind: RunnerReadOutcomeKind.Unreachable,
      cause: "TimeoutError",
    });
  });
});
