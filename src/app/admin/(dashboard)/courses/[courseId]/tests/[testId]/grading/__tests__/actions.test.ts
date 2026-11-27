import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const setTestFeedback = vi.fn().mockResolvedValue(undefined);
const releaseGradesAndAnswers = vi.fn().mockResolvedValue(undefined);
const requestRedo = vi.fn().mockResolvedValue(undefined);
const getActiveRedoRequest = vi.fn().mockResolvedValue(null);
// Parent-check stubs — a fixed test-1/course-1/q-1, always enrolled, so
// every literal id this file already uses resolves as the admin's own.
const getTest = vi
  .fn()
  .mockResolvedValue({ id: "test-1", courseId: "course-1", isPractice: false });
const getQuestion = vi.fn(async (_testId: string, questionId: string) =>
  questionId === "q-1" ? { id: questionId } : null,
);
const isEnrolled = vi.fn().mockResolvedValue(true);
const isTestSubmitted = vi.fn().mockResolvedValue(true);
const clearActiveStart = vi.fn().mockResolvedValue(undefined);

vi.mock("src/lib/services-singleton", () => ({
  getTestFeedbackService: vi.fn(async () => ({ setTestFeedback })),
  getTestService: vi.fn(async () => ({ releaseGradesAndAnswers, getTest })),
  getRedoRequestService: vi.fn(async () => ({
    requestRedo,
    getActiveRedoRequest,
  })),
  getQuestionService: vi.fn(async () => ({ getQuestion })),
  getEnrollmentService: vi.fn(async () => ({ isEnrolled })),
  getTestSubmissionService: vi.fn(async () => ({ isTestSubmitted })),
  getTestStartService: vi.fn(async () => ({ clearActiveStart })),
}));

import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  releaseTestAction,
  requestRedoAction,
  setTestFeedbackAction,
} from "../actions";

describe("Feature: grading actions extend revalidatePath to hub and variant page", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("each successful action revalidates /admin/grading and /admin/grading/<testId> in addition to the course-scoped path", async () => {
    const testId = "test-1";
    const courseId = "course-1";

    const fdFb = new FormData();
    fdFb.set("testId", testId);
    fdFb.set("courseId", courseId);
    fdFb.set("studentId", "stu-1");
    fdFb.set("feedback", "good");
    await setTestFeedbackAction(null, fdFb);

    const fdRel = new FormData();
    fdRel.set("testId", testId);
    fdRel.set("courseId", courseId);
    fdRel.set("mode", "whole");
    await releaseTestAction(null, fdRel);

    const fdRedo = new FormData();
    fdRedo.set("testId", testId);
    fdRedo.set("courseId", courseId);
    fdRedo.set("studentId", "stu-1");
    await requestRedoAction(null, fdRedo);

    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);

    // Course-scoped path still hit (existing behavior)
    expect(calls).toContain(
      `/admin/courses/${courseId}/tests/${testId}/grading`,
    );
    // Each must appear at least once across the three actions
    expect(calls).toContain("/admin/grading");
    expect(calls).toContain(`/admin/grading/${testId}`);

    // A release must reach the student page and the course's test list
    expect(calls).toContain(`/student/courses/${courseId}/tests/${testId}`);
    expect(calls).toContain(`/admin/courses/${courseId}`);
  });
});

describe("Feature: a redo request gives a student who already handed in a fresh timer", () => {
  beforeEach(() => {
    clearActiveStart.mockClear();
    requestRedo.mockClear();
    isTestSubmitted.mockClear();
    getActiveRedoRequest.mockReset().mockResolvedValue(null);
  });

  function redoForm() {
    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("studentId", "stu-1");
    return fd;
  }

  it("clears the student's timed start when they already handed in", async () => {
    isTestSubmitted.mockResolvedValueOnce(true);

    const state = await requestRedoAction(null, redoForm());

    expect(state.success).toBe(true);
    expect(clearActiveStart).toHaveBeenCalledWith("test-1", "stu-1", "admin-1");
  });

  it("leaves a student who is still writing with their original timed start", async () => {
    isTestSubmitted.mockResolvedValueOnce(false);

    const state = await requestRedoAction(null, redoForm());

    expect(state.success).toBe(true);
    expect(isTestSubmitted).toHaveBeenCalledWith("test-1", "stu-1");
    expect(clearActiveStart).not.toHaveBeenCalled();
  });

  it("keeps the running timed start when a redo is already open", async () => {
    isTestSubmitted.mockResolvedValueOnce(true);
    getActiveRedoRequest.mockResolvedValueOnce({ id: "redo-1" });

    const state = await requestRedoAction(null, redoForm());

    expect(state.success).toBe(true);
    expect(clearActiveStart).not.toHaveBeenCalled();
  });

  it("clears the old start before recording the redo so a page load in between cannot hand in the old attempt", async () => {
    isTestSubmitted.mockResolvedValueOnce(true);

    await requestRedoAction(null, redoForm());

    expect(clearActiveStart.mock.invocationCallOrder[0]).toBeLessThan(
      requestRedo.mock.invocationCallOrder[0],
    );
  });
});
