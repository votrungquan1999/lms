import type { Db } from "mongodb";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import type { QuestionChangeLogDocument } from "src/lib/question-change-log-service";
import type {
  MultiSelectQuestion,
  QuestionDocument,
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

let db: Db;

beforeEach(async () => {
  const setup = await setupTestDb();
  db = setup.db;
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

describe("Feature: replacing a test's questions deletes the old ones and writes the reviewed ones (Step 34 / D37 REPLACE)", () => {
  it("soft-deletes every existing question and writes the reviewed list in its place", async () => {
    const questionService = getTestServices().questionService;
    const oldQ1 = await questionService.addQuestion("test-3", {
      type: "free_text",
      title: "Old Q1",
      content: "Old content.",
      createdBy: "admin-1",
    });
    const oldQ2 = await questionService.addQuestion("test-3", {
      type: "free_text",
      title: "Old Q2",
      content: "Old content 2.",
      createdBy: "admin-1",
    });

    const reviewed: ParsedQuestion[] = [
      { title: "New Q1", content: "Fresh content.", type: "free_text" },
    ];

    const result = await importAiQuestionsAction(
      "test-3",
      "course-1",
      reviewed,
      "replace",
    );

    expect(result.success).toBe(true);
    const questions = await questionService.listQuestions("test-3");
    expect(questions.map((q) => q.title)).toEqual(["New Q1"]);
    expect(questions[0].order).toBe(1);

    // Read the raw docs, not listQuestions — it filters deletedAt out
    // entirely, so it can never distinguish a soft delete from a hard one.
    const questionCollection = db.collection<QuestionDocument>("question");
    for (const old of [oldQ1, oldQ2]) {
      const doc = await questionCollection.findOne({ id: old.id });
      expect(doc?.deletedAt).toBeInstanceOf(Date);
      expect(doc?.deletedBy).toBe("admin-1");
    }

    const deleteLogRows = await db
      .collection<QuestionChangeLogDocument>("questionChangeLog")
      .find({ questionId: { $in: [oldQ1.id, oldQ2.id] }, action: "delete" })
      .toArray();
    expect(deleteLogRows).toHaveLength(2);
  });

  // Green from the first run — no meaningful red possible. Validation runs
  // BEFORE the `withSpan` callback that contains REPLACE's delete loop, so a
  // rejected batch structurally cannot reach it; there is no code path this
  // test could catch mid-implementation the way the test above did.
  it("validates before deleting anything — a rejected REPLACE batch leaves the existing questions untouched", async () => {
    const questionService = getTestServices().questionService;
    await questionService.addQuestion("test-4", {
      type: "free_text",
      title: "Untouched Q1",
      content: "Stays put.",
      createdBy: "admin-1",
    });

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

    const result = await importAiQuestionsAction(
      "test-4",
      "course-1",
      failing,
      "replace",
    );

    expect(result.success).toBe(false);
    const questions = await questionService.listQuestions("test-4");
    expect(questions.map((q) => q.title)).toEqual(["Untouched Q1"]);
  });
});
