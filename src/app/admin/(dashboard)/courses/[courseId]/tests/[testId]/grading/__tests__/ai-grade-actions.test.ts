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
const applySuggestion = vi.fn();

vi.mock("src/lib/services-singleton", () => ({
  getAiGradeService: vi.fn(async () => ({
    generateForStudent,
    hasAnySuggestionsForStudent,
    regenerateForStudent,
    applySuggestion,
  })),
}));

import {
  applyAiSuggestionAction,
  autoGradeSubmissionAction,
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
    applySuggestion.mockResolvedValueOnce(undefined);

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
