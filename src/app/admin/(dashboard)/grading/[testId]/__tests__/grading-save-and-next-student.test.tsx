import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
}));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const gradeQuestion = vi.fn().mockResolvedValue(undefined);
vi.mock("src/lib/services-singleton", () => ({
  getGradeService: vi.fn(async () => ({ gradeQuestion, getGrade: vi.fn() })),
}));

import { saveAndJumpToNextAction } from "../../../courses/[courseId]/tests/[testId]/grading/actions";

/** Builds student-mode Save & Next form data; `questionId` is the current question. */
function buildFormData(questionId: string): FormData {
  const formData = new FormData();
  formData.set("testId", "test-1");
  formData.set("courseId", "course-1");
  formData.set("questionId", questionId);
  formData.set("studentId", "student-A");
  formData.set("currentStudentId", "student-A");
  formData.set("candidateIds", "q1,q2,q3");
  formData.set("returnPath", "/admin/grading/test-1");
  formData.set("mode", "student");
  formData.set("score", "85");
  formData.set("feedback", "Good work");
  return formData;
}

describe("Feature: Save & Next advances to the next question to grade in student-mode (per-student view)", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
    gradeQuestion.mockClear();
    vi.mocked(redirect).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("jumps to the next form-bearing question mid-list, and stops with no anchor after the last one", async () => {
    // Given: form-bearing question ids [q1, q2, q3], current = q2 (mid-list)
    // When + Then: redirect stays on the same student and carries the next question's anchor
    await expect(saveAndJumpToNextAction(buildFormData("q2"))).rejects.toThrow(
      /__REDIRECT__:/,
    );
    const midListUrl = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(midListUrl).toContain("/admin/grading/test-1");
    expect(midListUrl).toContain("studentId=student-A");
    expect(midListUrl).toContain("#question-q3");

    // Given: current = q3, the LAST form-bearing question
    // When + Then: redirect stays on the same student with NO anchor (stop)
    await expect(saveAndJumpToNextAction(buildFormData("q3"))).rejects.toThrow(
      /__REDIRECT__:/,
    );
    const lastUrl = vi.mocked(redirect).mock.calls[1]?.[0] as string;
    expect(lastUrl).toContain("studentId=student-A");
    expect(lastUrl).not.toContain("#question-");
  });
});
