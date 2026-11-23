import type { Span } from "@opentelemetry/api";
import {
  RunnerCheckAction,
  RunnerCreateAction,
  RunnerEventKind,
  recordRunnerEvent,
} from "src/lib/ai/runner-event";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Feature: a runner event is written to the span and the ai_runner log line", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes snake_case JSON without unset fields, and span attributes for the same facts", () => {
    // Given a refused create event with no job id
    const setAttributes = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const at = new Date("2026-11-24T01:00:00.000Z");

    // When it is recorded
    recordRunnerEvent({ setAttributes } as unknown as Span, {
      at,
      kind: RunnerEventKind.Create,
      action: RunnerCreateAction.Refused,
      refusedStatus: 429,
    });

    // Then the log line carries only the set fields, in snake_case, with the environment
    const [line] = log.mock.calls[0] as [string];
    expect(line.startsWith("ai_runner ")).toBe(true);
    expect(JSON.parse(line.slice("ai_runner ".length))).toEqual({
      at: "2026-11-24T01:00:00.000Z",
      kind: "create",
      action: "refused",
      refused_status: 429,
      environment: "test",
    });

    // And the span gets the matching attributes
    expect(setAttributes).toHaveBeenCalledWith({
      "lms.ai.runner.create_outcome": "refused",
      "lms.ai.runner.refused_status": 429,
    });
  });

  it("records a check with its job id, runner status and counts", () => {
    // Given a saved-suggestions check
    const setAttributes = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => {});

    // When it is recorded
    recordRunnerEvent({ setAttributes } as unknown as Span, {
      at: new Date(),
      kind: RunnerEventKind.Check,
      runnerJobId: "0123456789abcdef01234567",
      runnerStatus: "succeeded",
      action: RunnerCheckAction.SavedSuggestions,
      savedCount: 2,
    });

    // Then the span carries the check's facts
    expect(setAttributes).toHaveBeenCalledWith({
      "lms.ai.runner_job_id": "0123456789abcdef01234567",
      "lms.ai.runner.status": "succeeded",
      "lms.ai.runner.action": "saved_suggestions",
      "lms.ai.runner.saved_count": 2,
    });
  });
});
