import type { PoolQuestionSnapshotInput } from "src/lib/question-compose";
import {
  MediaContentType,
  type MultiSelectQuestion,
  QuestionService,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("QuestionService - Integration Tests", () => {
  dbIt(
    "should store type, options, weight, and mcGradingStrategy when admin creates a single_select question",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "What is 2 + 2?",
        content: "Choose the correct answer.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
          { text: "5", isCorrect: false },
        ],
        weight: 2,
        mcGradingStrategy: "all_or_nothing",
      });

      expect(question.type).toBe("single_select");
      const q = question as SingleSelectQuestion;
      expect(q.options).toHaveLength(3);
      expect(q.options.find((o) => o.isCorrect)?.text).toBe("4");
      expect(q.weight).toBe(2);
      expect(q.mcGradingStrategy).toBe("all_or_nothing");
    },
  );

  dbIt(
    "should persist and read back an explanation on a single_select question, leaving it undefined when omitted",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.addQuestion("test-1", {
        title: "What is 2 + 2?",
        content: "Choose the correct answer.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
        ],
        explanation: "4 is the sum of 2 and 2.",
      });
      await service.addQuestion("test-1", {
        title: "What is 3 + 3?",
        content: "Choose the correct answer.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "6", isCorrect: true },
          { text: "5", isCorrect: false },
        ],
      });

      const [withExplanation, withoutExplanation] =
        (await service.listQuestions("test-1")) as SingleSelectQuestion[];

      expect(withExplanation.explanation).toBe("4 is the sum of 2 and 2.");
      expect(withoutExplanation.explanation).toBeUndefined();
    },
  );

  dbIt(
    "should reject single_select creation when no option is marked correct",
    async ({ db }) => {
      const service = new QuestionService(db);

      await expect(
        service.addQuestion("test-1", {
          title: "Q?",
          content: "...",
          createdBy: "admin-1",
          type: "single_select",
          options: [
            { text: "A", isCorrect: false },
            { text: "B", isCorrect: false },
          ],
        }),
      ).rejects.toThrow(
        "single_select question must have exactly one correct option",
      );
    },
  );

  dbIt(
    "should reject single_select creation when more than one option is marked correct",
    async ({ db }) => {
      const service = new QuestionService(db);

      await expect(
        service.addQuestion("test-1", {
          title: "Q?",
          content: "...",
          createdBy: "admin-1",
          type: "single_select",
          options: [
            { text: "A", isCorrect: true },
            { text: "B", isCorrect: true },
          ],
        }),
      ).rejects.toThrow(
        "single_select question must have exactly one correct option",
      );
    },
  );

  dbIt(
    "should store a multi_select question with multiple correct options",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Which are even numbers?",
        content: "Select all that apply.",
        createdBy: "admin-1",
        type: "multi_select",
        options: [
          { text: "2", isCorrect: true },
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
        ],
        weight: 3,
        mcGradingStrategy: "partial",
      });

      expect(question.type).toBe("multi_select");
      const q = question as MultiSelectQuestion;
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(2);
      expect(q.weight).toBe(3);
      expect(q.mcGradingStrategy).toBe("partial");
    },
  );

  dbIt(
    "should reject multi_select creation when no option is marked correct",
    async ({ db }) => {
      const service = new QuestionService(db);

      await expect(
        service.addQuestion("test-1", {
          title: "Q?",
          content: "...",
          createdBy: "admin-1",
          type: "multi_select",
          options: [
            { text: "A", isCorrect: false },
            { text: "B", isCorrect: false },
          ],
          mcGradingStrategy: "all_or_nothing",
        }),
      ).rejects.toThrow(
        "multi_select question must have at least one correct option",
      );
    },
  );

  dbIt("should add a question with raw markdown content", async ({ db }) => {
    const service = new QuestionService(db);
    const markdownContent = `## Question 1\n\nWrite a function that sorts an array using **merge sort**.\n\n\`\`\`python\ndef merge_sort(arr):\n    # Your code here\n    pass\n\`\`\``;

    const question = await service.addQuestion("test-1", {
      title: "Merge Sort Implementation",
      content: markdownContent,
      createdBy: "admin-1",
    });

    expect(question.id).toBeDefined();
    expect(question.title).toBe("Merge Sort Implementation");
    expect(question.content).toBe(markdownContent);
    expect(question.order).toBe(1);
  });

  dbIt(
    "should store an image_answer question and map it back as image_answer",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Solve the integral",
        content: "Upload a photo of your handwritten solution.",
        createdBy: "admin-1",
        type: "image_answer",
      });

      expect(question.type).toBe("image_answer");
    },
  );

  dbIt("should assign increasing order numbers", async ({ db }) => {
    const service = new QuestionService(db);

    const q1 = await service.addQuestion("test-1", {
      title: "Q1",
      content: "First",
      createdBy: "admin-1",
    });
    const q2 = await service.addQuestion("test-1", {
      title: "Q2",
      content: "Second",
      createdBy: "admin-1",
    });

    expect(q1.order).toBe(1);
    expect(q2.order).toBe(2);
  });

  dbIt("should list questions ordered by order field", async ({ db }) => {
    const service = new QuestionService(db);
    await service.addQuestion("test-1", {
      title: "Q1",
      content: "First",
      createdBy: "admin-1",
    });
    await service.addQuestion("test-1", {
      title: "Q2",
      content: "Second",
      createdBy: "admin-1",
    });

    const questions = await service.listQuestions("test-1");

    expect(questions).toHaveLength(2);
    expect(questions[0].order).toBe(1);
    expect(questions[1].order).toBe(2);
  });

  dbIt("should bulk import questions with correct ordering", async ({ db }) => {
    const service = new QuestionService(db);

    const imported = await service.importQuestions(
      "test-1",
      [
        { title: "Imported Q1", content: "## First\nContent" },
        { title: "Imported Q2", content: "## Second\nContent" },
        { title: "Imported Q3", content: "## Third\nContent" },
      ],
      "admin-1",
    );

    expect(imported).toHaveLength(3);
    expect(imported[0].title).toBe("Imported Q1");
    expect(imported[0].order).toBe(1);
    expect(imported[2].order).toBe(3);
  });

  dbIt("should continue ordering after existing questions", async ({ db }) => {
    const service = new QuestionService(db);
    await service.addQuestion("test-1", {
      title: "Existing",
      content: "Already here",
      createdBy: "admin-1",
    });

    const imported = await service.importQuestions(
      "test-1",
      [{ title: "New", content: "From JSON" }],
      "admin-1",
    );

    expect(imported[0].order).toBe(2);
    const all = await service.listQuestions("test-1");
    expect(all).toHaveLength(2);
  });

  dbIt("should return empty array when importing nothing", async ({ db }) => {
    const service = new QuestionService(db);

    const result = await service.importQuestions("test-1", [], "admin-1");

    expect(result).toHaveLength(0);
  });

  dbIt(
    "should persist ordered media keys and round-trip them back in order without a URL",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.addQuestion("test-1", {
        title: "Diagram question",
        content: "Study the attached media.",
        createdBy: "admin-1",
        media: [
          {
            key: "media/questions/first.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1234,
            fileName: "first.png",
          },
          {
            key: "media/questions/second.mp4",
            contentType: MediaContentType.MP4,
            order: 1,
            size: 5678,
            fileName: "second.mp4",
          },
        ],
      });

      const [question] = await service.listQuestions("test-1");

      expect(question.media).toEqual([
        {
          key: "media/questions/first.png",
          url: "",
          contentType: MediaContentType.PNG,
          order: 0,
        },
        {
          key: "media/questions/second.mp4",
          url: "",
          contentType: MediaContentType.MP4,
          order: 1,
        },
      ]);
    },
  );

  dbIt(
    "should return media: [] for a question created without media and for imported questions",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.addQuestion("test-1", {
        title: "Plain question",
        content: "No media here.",
        createdBy: "admin-1",
      });
      await service.importQuestions(
        "test-1",
        [{ title: "Imported", content: "From file." }],
        "admin-1",
      );

      const questions = await service.listQuestions("test-1");

      expect(questions).toHaveLength(2);
      expect(questions[0].media).toEqual([]);
      expect(questions[1].media).toEqual([]);
    },
  );

  // Deterministic sampler for compose tests — takes the first `count`, no RNG.
  const takeFirst = <T>(items: T[], count: number): T[] =>
    items.slice(0, count);

  dbIt(
    "composeFromPools snapshots the drawn pool questions into the test with fresh ids and copied media",
    async ({ db }) => {
      const service = new QuestionService(db);

      const composed = await service.composeFromPools(
        "test-1",
        [
          {
            count: 1,
            questions: [
              {
                title: "Pool single",
                content: "pick one",
                type: "single_select",
                options: [
                  { id: "pool-opt-a", text: "A", isCorrect: true },
                  { id: "pool-opt-b", text: "B", isCorrect: false },
                ],
                weight: 2,
                mcGradingStrategy: "all_or_nothing",
                explanation: null,
                media: [
                  {
                    key: "pools/p1/diagram.png",
                    contentType: MediaContentType.PNG,
                    order: 0,
                    size: 100,
                    fileName: "diagram.png",
                  },
                ],
              },
            ],
          },
        ],
        "admin-1",
        takeFirst,
      );

      expect(composed).toHaveLength(1);

      const stored = await service.listQuestions("test-1");
      expect(stored).toHaveLength(1);

      const q = stored[0];
      expect(q.type).toBe("single_select");
      if (q.type !== "single_select") throw new Error("type narrow");
      expect(q.testId).toBe("test-1");
      expect(q.title).toBe("Pool single");
      expect(q.weight).toBe(2);
      // Every option id is regenerated on copy — none reuse the pool's ids.
      const poolOptionIds = new Set(["pool-opt-a", "pool-opt-b"]);
      expect(q.options.every((o) => !poolOptionIds.has(o.id))).toBe(true);
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
      // Media key is copied verbatim (shared S3, read-only).
      expect(q.media).toHaveLength(1);
      expect(q.media[0].key).toBe("pools/p1/diagram.png");
    },
  );

  dbIt(
    "composeFromPools carries a pooled single_select question's explanation into the composed test question",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.composeFromPools(
        "test-1",
        [
          {
            count: 1,
            questions: [
              {
                title: "Pool single with explanation",
                content: "pick one",
                type: "single_select",
                options: [
                  { id: "pool-opt-a", text: "A", isCorrect: true },
                  { id: "pool-opt-b", text: "B", isCorrect: false },
                ],
                weight: 1,
                mcGradingStrategy: "all_or_nothing",
                explanation: "A is correct because it is the capital.",
                media: [],
              },
            ],
          },
        ],
        "admin-1",
        takeFirst,
      );

      const [composed] = (await service.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];

      expect(composed.explanation).toBe(
        "A is correct because it is the capital.",
      );
    },
  );

  dbIt(
    "composeFromPools appends after existing questions, draws across pools, and caps count at the pool size",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.addQuestion("test-1", {
        title: "Existing",
        content: "already here",
        createdBy: "admin-1",
      });

      const poolA: PoolQuestionSnapshotInput[] = [
        freeTextSnapshot("A1"),
        freeTextSnapshot("A2"),
      ];
      const poolB: PoolQuestionSnapshotInput[] = [freeTextSnapshot("B1")];

      await service.composeFromPools(
        "test-1",
        [
          { count: 1, questions: poolA },
          // Requests 5 but pool only has 1 — capped to all available.
          { count: 5, questions: poolB },
        ],
        "admin-1",
        takeFirst,
      );

      const stored = await service.listQuestions("test-1");

      expect(stored.map((s) => s.title)).toEqual(["Existing", "A1", "B1"]);
      expect(stored.map((s) => s.order)).toEqual([1, 2, 3]);
    },
  );

  dbIt(
    "composeFromPools with all counts zero stores nothing",
    async ({ db }) => {
      const service = new QuestionService(db);

      const composed = await service.composeFromPools(
        "test-1",
        [{ count: 0, questions: [freeTextSnapshot("X")] }],
        "admin-1",
        takeFirst,
      );

      expect(composed).toEqual([]);
      expect(await service.listQuestions("test-1")).toHaveLength(0);
    },
  );

  // B4 — verification-only. The student question path (page → listQuestions)
  // has zero per-student branching, so a composed set is identical for every
  // reader. No production change drives this; it is green-from-first, locking
  // in the "every enrolled student sees the same composed set" invariant.
  dbIt(
    "a composed set is identical across repeated reads (every student sees the same questions)",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.composeFromPools(
        "test-1",
        [
          {
            count: 2,
            questions: [
              freeTextSnapshot("Q1"),
              freeTextSnapshot("Q2"),
              freeTextSnapshot("Q3"),
            ],
          },
        ],
        "admin-1",
        takeFirst,
      );

      const readForStudentA = await service.listQuestions("test-1");
      const readForStudentB = await service.listQuestions("test-1");

      expect(readForStudentA.map((q) => q.id)).toEqual(
        readForStudentB.map((q) => q.id),
      );
      expect(readForStudentA.map((q) => q.title)).toEqual(["Q1", "Q2"]);
    },
  );
});

/** Builds a minimal free-text pool-question snapshot input for compose tests. */
function freeTextSnapshot(title: string): PoolQuestionSnapshotInput {
  return {
    title,
    content: "",
    type: "free_text",
    options: null,
    weight: 1,
    mcGradingStrategy: null,
    explanation: null,
    media: [],
  };
}
