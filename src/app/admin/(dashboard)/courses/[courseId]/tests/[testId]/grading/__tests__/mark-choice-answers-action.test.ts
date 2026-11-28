import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { seedUnmarkedChoiceHandIn } from "src/tests/seed-unmarked-choice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markChoiceAnswersAction } from "../mark-choice-answers-action";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

function markForm(courseId: string, testId: string): FormData {
  const form = new FormData();
  form.set("courseId", courseId);
  form.set("testId", testId);
  return form;
}

describe("Feature: the teacher marks the choice answers that never got their automatic mark", () => {
  it("marks a hand-in made while the test was still practice", async () => {
    // Given a normal test whose hand-in has a right choice answer and no grade
    const seed = await seedUnmarkedChoiceHandIn(getTestServices());
    const { gradeService } = getTestServices();
    expect(await gradeService.getGrades(seed.test.id, seed.ann.id)).toEqual([]);

    // When the teacher presses Mark multiple-choice answers
    const result = await markChoiceAnswersAction(
      null,
      markForm(seed.course.id, seed.test.id),
    );

    // Then the answer carries its score from the answer key
    expect(result.success).toBe(true);
    const grades = await gradeService.getGrades(seed.test.id, seed.ann.id);
    expect(grades.map((g) => [g.questionId, g.score])).toEqual([
      [seed.question.id, 100],
    ]);
  });

  it("says marking did not finish when it fails, and a retry marks the answer", async () => {
    // Given a hand-in with an unmarked choice answer and a marking run that fails once
    const seed = await seedUnmarkedChoiceHandIn(getTestServices());
    const s = getTestServices();
    const mark = vi
      .spyOn(s.testSubmissionService, "markChoiceAnswersForHandIns")
      .mockRejectedValueOnce(new Error("database went away"));

    // When the teacher presses the button and it fails
    const failed = await markChoiceAnswersAction(
      null,
      markForm(seed.course.id, seed.test.id),
    );

    // Then she is told to try again and nothing is marked
    expect(failed).toEqual({
      success: false,
      message: "Marking did not finish. You can try again.",
    });
    expect(await s.gradeService.getGrades(seed.test.id, seed.ann.id)).toEqual(
      [],
    );

    // When she presses it again
    const retried = await markChoiceAnswersAction(
      null,
      markForm(seed.course.id, seed.test.id),
    );

    // Then the answer is marked
    mark.mockRestore();
    expect(retried.success).toBe(true);
    const grades = await s.gradeService.getGrades(seed.test.id, seed.ann.id);
    expect(grades.map((g) => g.score)).toEqual([100]);
  });
});
