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
const getGrade = vi.fn();
const getStatus = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getGradeService: vi.fn(async () => ({ gradeQuestion, getGrade })),
  getTestStatusService: vi.fn(async () => ({ getStatus })),
  getQuestionService: vi.fn(async () => ({
    listQuestions: vi.fn(async () => [{ id: "q1" }]),
  })),
}));

import { TestStatus } from "src/lib/test-status-service";
import { saveAndJumpToNextAction } from "../../../courses/[courseId]/tests/[testId]/grading/actions";

describe("Feature: Save & Next advances to the next ungraded student in student-mode", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
    gradeQuestion.mockClear();
    vi.mocked(redirect).mockClear();
    getStatus.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("given 3 submitted students A, B, C with current = A, when Save & Next is submitted, then the action persists the grade and redirects to ?studentId=B", async () => {
    // Given: post-save statuses — A graded, B and C still Submitted.
    getStatus.mockImplementation(
      async (_testId: string, studentId: string) => {
        if (studentId === "student-A") return TestStatus.Graded;
        return TestStatus.Submitted;
      },
    );

    const formData = new FormData();
    formData.set("testId", "test-1");
    formData.set("courseId", "course-1");
    formData.set("questionId", "q1");
    formData.set("studentId", "student-A");
    formData.set("currentStudentId", "student-A");
    formData.set("candidateIds", "student-A,student-B,student-C");
    formData.set("returnPath", "/admin/grading/test-1");
    formData.set("mode", "student");
    formData.set("score", "85");
    formData.set("feedback", "Good work");

    // When + Then: the action throws (because mocked `redirect` throws). The
    // thrown URL must point at student-B.
    await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
      /__REDIRECT__:/,
    );
    expect(redirect).toHaveBeenCalledTimes(1);
    const redirectedUrl = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(redirectedUrl).toContain("/admin/grading/test-1");
    expect(redirectedUrl).toContain("studentId=student-B");

    // And: the grade was persisted before the redirect.
    expect(gradeQuestion).toHaveBeenCalledTimes(1);
    expect(gradeQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: "test-1",
        questionId: "q1",
        studentId: "student-A",
        score: 85,
        feedback: "Good work",
        gradedBy: "admin-1",
      }),
    );
  });
});
