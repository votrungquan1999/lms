import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const gradeQuestion = vi.fn().mockResolvedValue(undefined);
const setTestFeedback = vi.fn().mockResolvedValue(undefined);
const releaseGrades = vi.fn().mockResolvedValue(undefined);
const requestRedo = vi.fn().mockResolvedValue(undefined);

vi.mock("src/lib/services-singleton", () => ({
  getGradeService: vi.fn(async () => ({ gradeQuestion })),
  getTestFeedbackService: vi.fn(async () => ({ setTestFeedback })),
  getTestService: vi.fn(async () => ({ releaseGrades })),
  getRedoRequestService: vi.fn(async () => ({ requestRedo })),
}));

import {
  gradeQuestionAction,
  releaseGradesAction,
  requestRedoAction,
  setTestFeedbackAction,
} from "../actions";

describe("Feature: grading actions extend revalidatePath to hub, variant page, and dashboard", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("each successful action revalidates /admin/grading, /admin/grading/<testId>, and /admin/dashboard in addition to the course-scoped path", async () => {
    const testId = "test-1";
    const courseId = "course-1";

    const fdGrade = new FormData();
    fdGrade.set("testId", testId);
    fdGrade.set("courseId", courseId);
    fdGrade.set("questionId", "q-1");
    fdGrade.set("studentId", "stu-1");
    fdGrade.set("score", "80");
    fdGrade.set("feedback", "ok");
    await gradeQuestionAction(null, fdGrade);

    const fdFb = new FormData();
    fdFb.set("testId", testId);
    fdFb.set("courseId", courseId);
    fdFb.set("studentId", "stu-1");
    fdFb.set("feedback", "good");
    await setTestFeedbackAction(null, fdFb);

    const fdRel = new FormData();
    fdRel.set("testId", testId);
    fdRel.set("courseId", courseId);
    await releaseGradesAction(null, fdRel);

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
    // New paths added by Step 13 — each must appear at least once across the four actions
    expect(calls).toContain("/admin/grading");
    expect(calls).toContain(`/admin/grading/${testId}`);
    expect(calls).toContain("/admin/dashboard");

    // Step 15 fix: releaseGradesAction now also revalidates the student page
    // so the student sees grades on the next visit after a global release.
    expect(calls).toContain(`/student/courses/${courseId}/tests/${testId}`);
  });
});
