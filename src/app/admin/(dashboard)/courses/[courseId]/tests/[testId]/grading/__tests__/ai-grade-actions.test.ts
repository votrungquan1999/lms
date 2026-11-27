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

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

// Mutable per-test mocks for AiGradeService. The first call to
// `hasAnySuggestionsForStudent` returns false (no rows yet); the action then
// starts a round once and the first call returns success. On the second action
// invocation, `hasAnySuggestionsForStudent` returns true and the action must
// short-circuit BEFORE starting a round.
const startRound = vi.fn();
const hasAnySuggestionsForStudent = vi.fn();
const applySuggestion = vi.fn();
// Parent-check stubs — a fixed test-1/course-1/q-1, always enrolled, so
// every literal id this file already uses resolves as the admin's own.
const getTest = vi
  .fn()
  .mockResolvedValue({ id: "test-1", courseId: "course-1", isPractice: false });
const getQuestion = vi.fn(async (_testId: string, questionId: string) =>
  questionId === "q-1" ? { id: questionId } : null,
);
const isEnrolled = vi.fn().mockResolvedValue(true);
// No job is pending in this file's scenarios.
const hasPendingForStudent = vi.fn().mockResolvedValue(false);

vi.mock("src/lib/services-singleton", () => ({
  getAiGradeService: vi.fn(async () => ({
    startRound,
    hasAnySuggestionsForStudent,
    applySuggestion,
  })),
  getAiGradeJobService: vi.fn(async () => ({ hasPendingForStudent })),
  getTestService: vi.fn(async () => ({ getTest })),
  getQuestionService: vi.fn(async () => ({ getQuestion })),
  getEnrollmentService: vi.fn(async () => ({ isEnrolled })),
}));

import { AiGradeJobTrigger } from "src/lib/ai-grade-job-service";
import { StartRoundOutcomeKind } from "src/lib/ai-grade-types";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  applyAiSuggestionAction,
  autoGradeSubmissionAction,
  regenerateQuestionAction,
  regenerateSubmissionAction,
} from "../ai-grade-actions";

describe("Feature: autoGradeSubmissionAction rejects a duplicate initial click", () => {
  beforeEach(() => {
    startRound.mockReset();
    hasAnySuggestionsForStudent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success on the first click and rejects the second click with the Regenerate-hint message without starting a second round", async () => {
    // Given — first call: no suggestions exist yet, the service creates 2 rows
    hasAnySuggestionsForStudent.mockResolvedValueOnce(false);
    startRound.mockResolvedValueOnce({
      kind: StartRoundOutcomeKind.Completed,
      suggestions: [{ id: "s-1" }, { id: "s-2" }],
    });

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

    // Then — rejection with the pinned verbatim message, naming the
    // whole-submission trigger's own label.
    expect(secondState.success).toBe(false);
    expect(secondState.message).toBe(
      "Suggestions already exist for this submission. Use Regenerate all to create a new round.",
    );
  });
});

describe("Feature: regenerateSubmissionAction rejects a missing/whitespace reason", () => {
  beforeEach(() => {
    startRound.mockReset();
    hasAnySuggestionsForStudent.mockReset();
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

describe("Feature: regenerateSubmissionAction honours the include-graded checkbox", () => {
  beforeEach(() => {
    startRound.mockReset();
    requireAdminSession.mockReset();
    requireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the service to include graded questions only when the checkbox is ticked", async () => {
    startRound.mockResolvedValue({
      kind: StartRoundOutcomeKind.Completed,
      suggestions: [{ id: "sugg-new" }],
    });
    const formWith = (ticked: boolean) => {
      const fd = new FormData();
      fd.set("testId", "test-1");
      fd.set("courseId", "course-1");
      fd.set("studentId", "stu-1");
      fd.set("reason", "Students use a base case first");
      // A ticked checkbox submits "on"; an unticked one submits nothing.
      if (ticked) fd.set("includeGraded", "on");
      return fd;
    };

    await regenerateSubmissionAction(null, formWith(true));
    await regenerateSubmissionAction(null, formWith(false));

    expect(startRound).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trigger: AiGradeJobTrigger.RegenerateAll,
        testId: "test-1",
        studentId: "stu-1",
        byAdminId: "admin-1",
        reason: "Students use a base case first",
        includeGraded: true,
      }),
    );
    expect(startRound).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        trigger: AiGradeJobTrigger.RegenerateAll,
        includeGraded: false,
      }),
    );
  });

  it("tells the teacher every question is already graded, instead of a fake success, when nothing was regenerated", async () => {
    // Every question already has the teacher's grade, so nothing is in scope.
    startRound.mockResolvedValue({
      kind: StartRoundOutcomeKind.NothingToGrade,
    });
    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("reason", "Students use a base case first");

    const state = await regenerateSubmissionAction(null, fd);

    expect(state).toEqual({
      success: false,
      message:
        "Every question already has your grade. Tick the box to regenerate them anyway.",
    });
  });

  it("tells the teacher there is nothing to regenerate when even graded questions were included", async () => {
    // No written answer is left to grade, even counting graded ones.
    startRound.mockResolvedValue({
      kind: StartRoundOutcomeKind.NothingToGrade,
    });
    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("reason", "Students use a base case first");
    fd.set("includeGraded", "on");

    const state = await regenerateSubmissionAction(null, fd);

    expect(state).toEqual({
      success: false,
      message: "This student has no written answers to regenerate.",
    });
  });
});

describe("Feature: autoGradeSubmissionAction surfaces LLM/Zod failure as the pinned error message (Step 9)", () => {
  beforeEach(() => {
    startRound.mockReset();
    hasAnySuggestionsForStudent.mockReset();
    revalidatePathMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success:false with the verbatim pinned message AND does NOT call revalidatePath when startRound throws", async () => {
    // Given — no prior suggestions exist; service.startRound throws.
    hasAnySuggestionsForStudent.mockResolvedValueOnce(false);
    startRound.mockRejectedValueOnce(new Error("simulated LLM failure"));

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
    startRound.mockReset();
    revalidatePathMock.mockReset();
    requireAdminSession.mockReset();
    requireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("on happy-path success: regenerates the one targeted question, revalidates the 3 admin paths (not the student path), and returns the pinned success message", async () => {
    // Given — valid form fields incl. questionId + reason; service resolves.
    startRound.mockResolvedValueOnce({
      kind: StartRoundOutcomeKind.Completed,
      suggestions: [{ id: "sugg-new" }],
    });

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
    expect(startRound).toHaveBeenCalledWith({
      trigger: AiGradeJobTrigger.RegenerateQuestion,
      testId: "test-1",
      courseId: "course-1",
      studentId: "stu-1",
      questionId: "q-1",
      byAdminId: "admin-1",
      reason: "Reconsider the partial-credit cutoff",
      includeGraded: true,
    });

    // Then — only the 3 admin paths revalidated; NOT the student path
    // (suggestions stay admin-side until Apply).
    expect(revalidatePathMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/courses/course-1/tests/test-1/grading",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading/test-1");
    expect(revalidatePathMock).not.toHaveBeenCalledWith(
      "/student/courses/course-1/tests/test-1",
    );
  });

  it("rejects a missing/whitespace reason with a user-visible error and does NOT start a round", async () => {
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
    expect(startRound).not.toHaveBeenCalled();

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
    expect(startRound).not.toHaveBeenCalled();
  });

  it("rejects with the pinned unauth message when requireAdminSession throws, and does NOT call startRound or revalidatePath", async () => {
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
    expect(startRound).not.toHaveBeenCalled();
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

describe("Feature: regenerateQuestionAction refuses a reason outside 3 to 500 characters and an answer with nothing to regenerate", () => {
  beforeEach(() => {
    startRound.mockReset();
  });

  const formWith = (reason: string) => {
    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    fd.set("questionId", "q-1");
    fd.set("reason", reason);
    return fd;
  };

  it.each([
    { label: "2 characters", reason: "ab" },
    { label: "2 characters once trimmed", reason: "  ab  " },
    { label: "501 characters", reason: "x".repeat(501) },
  ])("starts no round for a reason of $label", async ({ reason }) => {
    const state = await regenerateQuestionAction(null, formWith(reason));

    expect(state.success).toBe(false);
    expect(startRound).not.toHaveBeenCalled();
  });

  it("starts the round for a reason of exactly 3 characters", async () => {
    startRound.mockResolvedValueOnce({
      kind: StartRoundOutcomeKind.Completed,
      suggestions: [{ id: "sugg-new" }],
    });

    const state = await regenerateQuestionAction(null, formWith("abc"));

    expect(state.success).toBe(true);
  });

  it("reports a failure, not a success, when the answer has nothing to regenerate", async () => {
    startRound.mockResolvedValueOnce({
      kind: StartRoundOutcomeKind.NothingToGrade,
    });

    const state = await regenerateQuestionAction(
      null,
      formWith("Reconsider the cutoff"),
    );

    expect(state).toEqual({
      success: false,
      message: "This answer has no written text to regenerate.",
    });
  });
});

describe("Feature: applyAiSuggestionAction (Step 6 action-layer)", () => {
  beforeEach(() => {
    applySuggestion.mockReset();
    revalidatePathMock.mockReset();
    requireAdminSession.mockReset();
    requireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
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

    // Then — all 4 cache paths invalidated (3 admin + 1 student).
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/courses/course-1/tests/test-1/grading",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/grading/test-1");
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
    startRound.mockReset();
  });

  afterEach(() => {
    trace.disable();
    vi.restoreAllMocks();
  });

  it("prints the failed action's trace id alongside the error, so the log can be matched to the trace in Grafana", async () => {
    // Given — the grading call fails inside the action's span.
    hasAnySuggestionsForStudent.mockResolvedValueOnce(false);
    startRound.mockRejectedValueOnce(new Error("simulated failure"));
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
    requireAdminSession
      .mockReset()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
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
