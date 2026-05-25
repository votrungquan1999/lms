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

import { saveAndJumpToNextAction } from "../../../courses/[courseId]/tests/[testId]/grading/actions";

describe("Feature: Save & Next in question-mode advances to the next student whose answer to the current question is ungraded", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
    gradeQuestion.mockClear();
    vi.mocked(redirect).mockClear();
    getGrade.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("given candidates [A, B, C], A's grade for q1 already exists, current = B, when Save & Next is submitted in question-mode, then redirects to ?mode=question&questionId=q1&studentId=C (skipping past current, and A's prior grade is irrelevant because it's before B)", async () => {
    // Given: A is graded, C is not. B is the current student being graded now.
    getGrade.mockImplementation(
      async (_testId: string, _questionId: string, studentId: string) => {
        if (studentId === "student-A") return { score: 80 };
        if (studentId === "student-C") return null;
        return null;
      },
    );

    const formData = new FormData();
    formData.set("testId", "test-1");
    formData.set("courseId", "course-1");
    formData.set("questionId", "q1");
    formData.set("studentId", "student-B");
    formData.set("currentStudentId", "student-B");
    formData.set("candidateIds", "student-A,student-B,student-C");
    formData.set("returnPath", "/admin/grading/test-1");
    formData.set("mode", "question");
    formData.set("score", "70");
    formData.set("feedback", "OK");

    await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
      /__REDIRECT__:/,
    );

    expect(redirect).toHaveBeenCalledTimes(1);
    const url = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(url).toContain("mode=question");
    expect(url).toContain("questionId=q1");
    expect(url).toContain("studentId=student-C");

    expect(gradeQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: "q1",
        studentId: "student-B",
        score: 70,
      }),
    );
  });
});
