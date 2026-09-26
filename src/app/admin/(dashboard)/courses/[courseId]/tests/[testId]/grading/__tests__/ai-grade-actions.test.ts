import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

// Mutable per-test mocks for AiGradeService. The first call to
// `hasAnySuggestionsForStudent` returns false (no rows yet); the action then
// invokes `generateForStudent` once and the first call returns success. On the
// second action invocation, `hasAnySuggestionsForStudent` returns true and the
// action must short-circuit BEFORE the LLM call.
const generateForStudent = vi.fn();
const hasAnySuggestionsForStudent = vi.fn();
const regenerateForStudent = vi.fn();
const regenerateForQuestion = vi.fn();
const applySuggestion = vi.fn();

vi.mock("src/lib/services-singleton", () => ({
  getAiGradeService: vi.fn(async () => ({
    generateForStudent,
    hasAnySuggestionsForStudent,
    regenerateForStudent,
    regenerateForQuestion,
    applySuggestion,
  })),
}));

import {
  applyAiSuggestionAction,
  autoGradeSubmissionAction,
  regenerateQuestionAction,
  regenerateSubmissionAction,
} from "../ai-grade-actions";

describe("Feature: autoGradeSubmissionAction rejects a duplicate initial click", () => {
  beforeEach(() => {
    generateForStudent.mockReset();
    hasAnySuggestionsForStudent.mockReset();
    regenerateForStudent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success on the first click and rejects the second click with the Regenerate-hint message without calling generateForStudent again", async () => {
    // Given — first call: no suggestions exist yet, the service creates 2 rows
    hasAnySuggestionsForStudent.mockResolvedValueOnce(false);
    generateForStudent.mockResolvedValueOnce([{ id: "s-1" }, { id: "s-2" }]);

    // Given — second call: suggestions now exist
    hasAnySuggestionsForStudent.mockResolvedValueOnce(true);

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");

    // When — first invocation
    const firstState = await autoGradeSubmissionAction(null, fd);

    // Then — first invocation succeeds
    expect(firstState.success).toBe(true);

    // When — second invocation with the same inputs
    const secondState = await autoGradeSubmissionAction(null, fd);

    // Then — rejection with the pinned verbatim message
    expect(secondState.success).toBe(false);
    expect(secondState.message).toBe(
      "Suggestions already exist for this submission. Use Regenerate to create a new round.",
    );
  });
});

describe("Feature: regenerateSubmissionAction rejects a missing/whitespace reason", () => {
  beforeEach(() => {
    generateForStudent.mockReset();
    hasAnySuggestionsForStudent.mockReset();
    regenerateForStudent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success:false with a user-visible error message when reason input is invalid (whitespace-only or missing)", async () => {
    // Given — whitespace-only reason (trips Zod .trim().min(1))
    const fdWhitespace = new FormData();
    fdWhitespace.set("testId", "test-1");
    fdWhitespace.set("courseId", "course-1");
    fdWhitespace.set("studentId", "stu-1");
    fdWhitespace.set("reason", "    ");

    // When
    const whitespaceState = await regenerateSubmissionAction(
      null,
      fdWhitespace,
    );

    // Then — refusal with a user-visible error message
    expect(whitespaceState.success).toBe(false);
    expect(whitespaceState.message.length).toBeGreaterThan(0);

    // Given — reason field omitted entirely
    const fdMissing = new FormData();
    fdMissing.set("testId", "test-1");
    fdMissing.set("courseId", "course-1");
    fdMissing.set("studentId", "stu-1");

    // When
    const missingState = await regenerateSubmissionAction(null, fdMissing);

    // Then — refusal with a user-visible error message
    expect(missingState.success).toBe(false);
    expect(missingState.message.length).toBeGreaterThan(0);
  });
});

describe("Feature: autoGradeSubmissionAction surfaces LLM/Zod failure as the pinned error message (Step 9)", () => {
  beforeEach(() => {
    generateForStudent.mockReset();
    hasAnySuggestionsForStudent.mockReset();
    regenerateForStudent.mockReset();
    revalidatePathMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success:false with the verbatim pinned message AND does NOT call revalidatePath when generateForStudent throws", async () => {
    // Given — no prior suggestions exist; service.generateForStudent throws.
    hasAnySuggestionsForStudent.mockResolvedValueOnce(false);
    generateForStudent.mockRejectedValueOnce(
      new Error("simulated LLM failure"),
    );

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");

    // When
    const state = await autoGradeSubmissionAction(null, fd);

    // Then — pinned verbatim error message returned to the client.
    expect(state.success).toBe(false);
    expect(state.message).toBe("AI grading failed. Please try again.");

    // Then — no cache invalidation happened (revalidatePath is success-path only).
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("Feature: regenerateQuestionAction (Step A2 — single-question regenerate)", () => {
  beforeEach(() => {
    regenerateForQuestion.mockReset();
    revalidatePathMock.mockReset();
    requireAdminSession.mockReset();
    requireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("on happy-path success: regenerates the one targeted question, revalidates the 4 admin paths (not the student path), and returns the pinned success message", async () => {
    // Given — valid form fields incl. questionId + reason; service resolves.
    regenerateForQuestion.mockResolvedValueOnce([{ id: "sugg-new" }]);

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("questionId", "q-1");
    fd.set("reason", "Reconsider the partial-credit cutoff");

    // When
    const state = await regenerateQuestionAction(null, fd);

    // Then — pinned success message.
    expect(state.success).toBe(true);
    expect(state.message).toBe("AI suggestions regenerated");

    // Then — service called with the SPECIFIC question + admin + reason (pins
    // per-question scoping: questionId is the 3rd arg).
    expect(regenerateForQuestion).toHaveBeenCalledWith(
      "test-1",
      "stu-1",
      "q-1",
      "admin-1",
      "Reconsider the partial-credit cutoff",
    );

    // Then — only the 4 admin paths revalidated; NOT the student path
    // (suggestions stay admin-side until Apply).
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/courses/course-1/tests/test-1/grading",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading/test-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/dashboard");
    expect(revalidatePathMock).not.toHaveBeenCalledWith(
      "/student/courses/course-1/tests/test-1",
    );
  });

  it("rejects a missing/whitespace reason with a user-visible error and does NOT call regenerateForQuestion", async () => {
    // Given — whitespace-only reason (trips Zod .trim().min(1)).
    const fdWhitespace = new FormData();
    fdWhitespace.set("testId", "test-1");
    fdWhitespace.set("courseId", "course-1");
    fdWhitespace.set("studentId", "stu-1");
    fdWhitespace.set("questionId", "q-1");
    fdWhitespace.set("reason", "    ");

    // When
    const whitespaceState = await regenerateQuestionAction(null, fdWhitespace);

    // Then — refusal with a user-visible message; service never reached.
    expect(whitespaceState.success).toBe(false);
    expect(whitespaceState.message.length).toBeGreaterThan(0);
    expect(regenerateForQuestion).not.toHaveBeenCalled();

    // Given — reason field omitted entirely.
    const fdMissing = new FormData();
    fdMissing.set("testId", "test-1");
    fdMissing.set("courseId", "course-1");
    fdMissing.set("studentId", "stu-1");
    fdMissing.set("questionId", "q-1");

    // When
    const missingState = await regenerateQuestionAction(null, fdMissing);

    // Then — refusal again; service still never reached.
    expect(missingState.success).toBe(false);
    expect(missingState.message.length).toBeGreaterThan(0);
    expect(regenerateForQuestion).not.toHaveBeenCalled();
  });

  it("rejects with the pinned unauth message when requireAdminSession throws, and does NOT call regenerateForQuestion or revalidatePath", async () => {
    // Given — auth fails.
    requireAdminSession.mockRejectedValueOnce(new Error("no session"));

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("questionId", "q-1");
    fd.set("reason", "valid reason");

    // When
    const state = await regenerateQuestionAction(null, fd);

    // Then — pinned unauthorized message; service + revalidate never reached.
    expect(state.success).toBe(false);
    expect(state.message).toBe("Unauthorized: admin access required");
    expect(regenerateForQuestion).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

/** What `applySuggestion` resolves to: the suggestion row that was applied. */
const appliedSuggestion = {
  id: "sugg-1",
  testId: "test-1",
  questionId: "q-1",
  studentId: "stu-1",
  score: 70,
  feedback: "AI feedback",
  solution: "AI solution",
};

describe("Feature: applyAiSuggestionAction (Step 6 action-layer)", () => {
  beforeEach(() => {
    applySuggestion.mockReset();
    revalidatePathMock.mockReset();
    requireAdminSession.mockReset();
    requireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("on happy-path success: revalidates the 5 paths (admin + student) and returns the pinned success message", async () => {
    // Given — valid form fields, no overrides; service apply resolves.
    applySuggestion.mockResolvedValueOnce(appliedSuggestion);

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("suggestionId", "sugg-1");

    // When
    const state = await applyAiSuggestionAction(null, fd);

    // Then — pinned success message returned to the client.
    expect(state.success).toBe(true);
    expect(state.message).toBe("Suggestion applied as the official grade.");

    // Then — all 5 cache paths invalidated (4 admin + 1 student).
    expect(revalidatePathMock).toHaveBeenCalledTimes(5);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/courses/course-1/tests/test-1/grading",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading/test-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/student/courses/course-1/tests/test-1",
    );
  });

  it("rejects with the pinned unauth message when requireAdminSession throws, and does NOT call applySuggestion or revalidatePath", async () => {
    // Given — auth fails.
    requireAdminSession.mockRejectedValueOnce(new Error("no session"));

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("suggestionId", "sugg-1");

    // When
    const state = await applyAiSuggestionAction(null, fd);

    // Then — pinned unauthorized message; service + revalidate never reached.
    expect(state.success).toBe(false);
    expect(state.message).toBe("Unauthorized: admin access required");
    expect(applySuggestion).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("Feature: a failed AI action's log line links to its trace", () => {
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
    hasAnySuggestionsForStudent.mockReset();
    generateForStudent.mockReset();
  });

  afterEach(() => {
    trace.disable();
    vi.restoreAllMocks();
  });

  it("prints the failed action's trace id alongside the error, so the log can be matched to the trace in Grafana", async () => {
    // Given — the grading call fails inside the action's span.
    hasAnySuggestionsForStudent.mockResolvedValueOnce(false);
    generateForStudent.mockRejectedValueOnce(new Error("simulated failure"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");

    // When
    await autoGradeSubmissionAction(null, fd);

    // Then — the logged line carries the action span's trace id.
    const actionSpan = exporter
      .getFinishedSpans()
      .find((span) => span.name === "action.autoGradeSubmissionAction");
    const traceId = actionSpan?.spanContext().traceId;
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`trace_id=${traceId}`),
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("simulated failure"),
    );
  });
});

describe("Feature: applying an AI suggestion records whether the teacher accepted it as-is", () => {
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
    applySuggestion.mockReset();
    requireAdminSession.mockReset().mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(() => {
    trace.disable();
    vi.restoreAllMocks();
  });

  it("records the AI's score, the score actually applied, the gap, and which texts the teacher changed", async () => {
    applySuggestion.mockResolvedValueOnce(appliedSuggestion);

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("suggestionId", "sugg-1");
    fd.set("scoreOverride", "55");
    fd.set("feedbackOverride", "AI feedback");

    await applyAiSuggestionAction(null, fd);

    const actionSpan = exporter
      .getFinishedSpans()
      .find((span) => span.name === "action.applyAiSuggestionAction");
    expect(actionSpan?.attributes).toMatchObject({
      "lms.ai.outcome": "applied",
      "lms.ai.suggestion_score": 70,
      "lms.ai.final_score": 55,
      "lms.ai.score_gap": -15,
      "lms.ai.feedback_changed": false,
      "lms.ai.solution_changed": false,
    });
  });
});
