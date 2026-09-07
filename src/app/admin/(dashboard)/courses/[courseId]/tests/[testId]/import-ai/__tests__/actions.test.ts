import type { ParsedQuestion } from "src/lib/ai/ai-client";
import type {
  MultiSelectQuestion,
  SingleSelectQuestion,
} from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importAiQuestionsAction } from "../actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: importing the reviewed AI-extracted list onto the test", () => {
  it("writes the reviewed questions onto the test in the order the teacher reviewed them", async () => {
    // A mixed-type reviewed list, in the order the teacher left it after review.
    const reviewed: ParsedQuestion[] = [
      {
        title: "Q1: photosynthesis",
        content: "Explain it in one paragraph.",
        type: "free_text",
      },
      {
        title: "Q2: pick the prime",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: true },
        ],
      },
      {
        title: "Q3: pick all primes",
        content: "Choose every prime number.",
        type: "multi_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction(
      "test-1",
      "course-1",
      reviewed,
    );

    expect(result.success).toBe(true);
    const questions =
      await getTestServices().questionService.listQuestions("test-1");
    expect(questions.map((q) => q.title)).toEqual([
      "Q1: photosynthesis",
      "Q2: pick the prime",
      "Q3: pick all primes",
    ]);
    expect(questions.map((q) => q.order)).toEqual([1, 2, 3]);
    // Fidelity check: type/options must survive (addQuestion, not importQuestions).
    expect(questions[1].type).toBe("single_select");
    expect(
      (questions[1] as SingleSelectQuestion).options.map((o) => o.text),
    ).toEqual(["4", "7"]);
  });

  it("rejects the whole batch and names the offending question when one cannot be accepted, importing none of them", async () => {
    // Question 2 has TWO correct options — a wrong key, not a missing one,
    // so D32's relaxation for AI import does not cover it either.
    const reviewed: ParsedQuestion[] = [
      {
        title: "Q1: photosynthesis",
        content: "Explain it in one paragraph.",
        type: "free_text",
      },
      {
        title: "Q2: broken key",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
      {
        title: "Q3: pick all primes",
        content: "Choose every prime number.",
        type: "multi_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction(
      "test-1",
      "course-1",
      reviewed,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Question 2");
    expect(result.message).toContain("Q2: broken key");
    // The offender's 0-indexed position — Step 33 routes this onto that
    // question's own card rather than a bare page-level banner.
    expect(result.invalidQuestionIndex).toBe(1);
    const questions =
      await getTestServices().questionService.listQuestions("test-1");
    expect(questions).toHaveLength(0);
  });

  it("imports a keyless single_select and a keyless multi_select rather than rejecting the batch (D32)", async () => {
    // Q1 (free_text) writes first so a write-time regression — checkMcOptions
    // run without D32's relaxation — shows up as a partial import, not a
    // clean pre-write rejection.
    const reviewed: ParsedQuestion[] = [
      {
        title: "Q1: photosynthesis",
        content: "Explain it in one paragraph.",
        type: "free_text",
      },
      {
        title: "Q2: keyless single-select",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: false },
        ],
      },
      {
        title: "Q3: keyless multi-select",
        content: "Choose every prime number.",
        type: "multi_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: false },
        ],
      },
    ];

    const result = await importAiQuestionsAction(
      "test-1",
      "course-1",
      reviewed,
    );

    expect(result.success).toBe(true);
    const questions =
      await getTestServices().questionService.listQuestions("test-1");
    expect(questions).toHaveLength(3);
    expect(
      (questions[1] as SingleSelectQuestion).options.every((o) => !o.isCorrect),
    ).toBe(true);
    expect(
      (questions[2] as MultiSelectQuestion).options.every((o) => !o.isCorrect),
    ).toBe(true);
  });

  it("leaves nothing written on a genuinely invalid batch — the all-or-nothing guarantee, asserted directly rather than left incidental", async () => {
    // Two correct options on a single_select is a WRONG key, not a missing
    // one — D32's relaxation does not cover it, so this batch is still
    // rejected outright and must leave zero questions behind.
    const failing: ParsedQuestion[] = [
      {
        title: "Q1: broken key",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction("test-2", "course-1", failing);

    expect(result.success).toBe(false);
    const questions =
      await getTestServices().questionService.listQuestions("test-2");
    expect(questions).toHaveLength(0);
  });
});
