import type { AnswerDocument } from "src/lib/answer-service";
import { AnswerService } from "src/lib/answer-service";
import type { GradeDocument } from "src/lib/grade-service";
import { PoolQuestionService } from "src/lib/pool-question-service";
import { QuestionChangeLogService } from "src/lib/question-change-log-service";
import type { PoolQuestionSnapshotInput } from "src/lib/question-compose";
import {
  checkMcOptions,
  type FreeTextQuestion,
  type McOption,
  MediaContentType,
  type MultiSelectQuestion,
  type QuestionDocument,
  QuestionService,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { TestStartService } from "src/lib/test-start-service";
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
    "should persist and read back a referenceAnswer and explanation on a free_text question, leaving them undefined when omitted",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.addQuestion("test-1", {
        title: "Explain photosynthesis.",
        content: "Write a short paragraph.",
        createdBy: "admin-1",
        type: "free_text",
        referenceAnswer: "Plants convert light into chemical energy.",
        explanation: "Focus on the role of chlorophyll.",
      });
      await service.addQuestion("test-1", {
        title: "Explain gravity.",
        content: "Write a short paragraph.",
        createdBy: "admin-1",
        type: "free_text",
      });

      const [withFields, withoutFields] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];

      expect(withFields.referenceAnswer).toBe(
        "Plants convert light into chemical energy.",
      );
      expect(withFields.explanation).toBe("Focus on the role of chlorophyll.");
      expect(withoutFields.referenceAnswer).toBeUndefined();
      expect(withoutFields.explanation).toBeUndefined();
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
                referenceAnswer: null,
                answerRevealMode: null,
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
                referenceAnswer: null,
                answerRevealMode: null,
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
    "composeFromPools carries a pooled free_text question's referenceAnswer into the composed test question",
    async ({ db }) => {
      const service = new QuestionService(db);

      await service.composeFromPools(
        "test-1",
        [
          {
            count: 1,
            questions: [
              {
                title: "Pool free_text with referenceAnswer",
                content: "explain",
                type: "free_text",
                options: null,
                weight: 1,
                mcGradingStrategy: null,
                explanation: null,
                referenceAnswer: "The model answer from the pool.",
                answerRevealMode: null,
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
      )) as FreeTextQuestion[];

      expect(composed.referenceAnswer).toBe("The model answer from the pool.");
    },
  );

  dbIt(
    "traces an answerRevealMode override end-to-end: authored on a pool question, composed into a test, readable on the composed question — while a pool question with no override composes as undefined",
    async ({ db }) => {
      const poolQuestionService = new PoolQuestionService(db);
      const questionService = new QuestionService(db);

      await poolQuestionService.addPoolQuestion("pool-1", {
        title: "Pool question with override",
        content: "explain",
        createdBy: "admin-1",
        answerRevealMode: "plain",
      });
      await poolQuestionService.addPoolQuestion("pool-1", {
        title: "Pool question without override",
        content: "explain",
        createdBy: "admin-1",
      });

      // Real bridge, not a hand-built literal — proves listSnapshotInputs
      // actually carries the field, not just that composeFromPools would copy
      // it if given a correct snapshot.
      const snapshots = await poolQuestionService.listSnapshotInputs("pool-1");

      await questionService.composeFromPools(
        "test-1",
        [{ count: 2, questions: snapshots }],
        "admin-1",
        takeFirst,
      );

      const [withOverride, withoutOverride] =
        (await questionService.listQuestions("test-1")) as FreeTextQuestion[];

      expect(withOverride.answerRevealMode).toBe("plain");
      expect(withoutOverride.answerRevealMode).toBeUndefined();
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

describe("updateQuestion — a teacher corrects a question they already wrote (Step 19)", () => {
  dbIt(
    "switches a free_text question's answer-reveal override and stamps who/when",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await service.updateQuestion(
        question.id,
        { answerRevealMode: "plain" },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      expect(updated.answerRevealMode).toBe("plain");

      // updatedAt/updatedBy are hardcoded null by every write path today —
      // this is the first code to stamp them, so read the raw document.
      const doc = await db
        .collection<QuestionDocument>("question")
        .findOne({ id: question.id });
      expect(doc?.updatedBy).toBe("admin-2");
      expect(doc?.updatedAt).toBeInstanceOf(Date);
    },
  );

  dbIt(
    "clears the override back to inheriting the test's default, distinct from switching it",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        answerRevealMode: "diff",
      });

      await service.updateQuestion(
        question.id,
        { answerRevealMode: null },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      // Never a concrete default (D2/D9): cleared means "inherit the test".
      expect(updated.answerRevealMode).toBeUndefined();
    },
  );

  dbIt(
    "corrects a free_text question's model answer and explanation (Step 20)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await service.updateQuestion(
        question.id,
        {
          referenceAnswer: "Objects with mass attract each other.",
          explanation: "Newton's law of universal gravitation.",
        },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      expect(updated.referenceAnswer).toBe(
        "Objects with mass attract each other.",
      );
      expect(updated.explanation).toBe(
        "Newton's law of universal gravitation.",
      );
    },
  );

  dbIt(
    "clears a model answer and explanation back to absent, not empty string (Step 20)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
        explanation: "Newton's law of universal gravitation.",
      });

      await service.updateQuestion(
        question.id,
        { referenceAnswer: null, explanation: null },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      expect(updated.referenceAnswer).toBeUndefined();
      expect(updated.explanation).toBeUndefined();
    },
  );

  dbIt(
    "leaves referenceAnswer and answerRevealMode untouched when only explanation is corrected (Step 20)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        answerRevealMode: "diff",
        referenceAnswer: "Objects with mass attract each other.",
        explanation: "Newton's law of universal gravitation.",
      });

      await service.updateQuestion(
        question.id,
        { explanation: "Newton's law, corrected." },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      // The absent keys must be left alone, not wiped to null (D2/D9 contract).
      expect(updated.answerRevealMode).toBe("diff");
      expect(updated.referenceAnswer).toBe(
        "Objects with mass attract each other.",
      );
    },
  );

  dbIt(
    "corrects a multiple-choice question's explanation — the column it shares with free_text (Step 20)",
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
        ],
      });

      await service.updateQuestion(
        question.id,
        { explanation: "4 is the sum of 2 and 2." },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];
      expect(updated.explanation).toBe("4 is the sum of 2 and 2.");
    },
  );

  dbIt("corrects a question's title and content (Step 26)", async ({ db }) => {
    const service = new QuestionService(db);

    const question = await service.addQuestion("test-1", {
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin-1",
    });

    await service.updateQuestion(
      question.id,
      {
        title: "Explain gravity (revised)",
        content: "Write two sentences.",
      },
      "admin-2",
    );

    const [updated] = await service.listQuestions("test-1");
    expect(updated.title).toBe("Explain gravity (revised)");
    expect(updated.content).toBe("Write two sentences.");
  });

  dbIt(
    "leaves title and content untouched when only another field is corrected (Step 26 — absent-key pin)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      // title/content are absent from this input — only explanation changes.
      await service.updateQuestion(
        question.id,
        { explanation: "Focus on mass, not weight." },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      expect(updated.title).toBe("Explain gravity");
      expect(updated.content).toBe("In your own words.");
      expect(updated.explanation).toBe("Focus on mass, not weight.");
    },
  );

  dbIt(
    "leaves a student's submitted answer and grade byte-identical (Step 21 — regression pin, no production change)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      const answerDoc: AnswerDocument = {
        id: "answer-1",
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Mass attracts mass." },
        submittedAt: new Date("2026-01-01T00:00:00Z"),
      };
      await db.collection<AnswerDocument>("answer").insertOne({
        ...answerDoc,
      });

      const gradeDoc: GradeDocument = {
        id: "grade-1",
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        score: 80,
        feedback: "Good but incomplete.",
        solution: "Mass attracts mass proportionally.",
        gradedAt: new Date("2026-01-01T01:00:00Z"),
        gradedBy: "admin-1",
        updatedAt: null,
        updatedBy: null,
      };
      await db.collection<GradeDocument>("grade").insertOne({ ...gradeDoc });

      // Edits wording (via a title correction is out of this batch's scope,
      // so exercise every field this batch DOES own instead): reveal mode,
      // model answer, and explanation.
      await service.updateQuestion(
        question.id,
        {
          answerRevealMode: "plain",
          referenceAnswer: "Objects with mass attract each other.",
          explanation: "Newton's law of universal gravitation.",
        },
        "admin-2",
      );

      const answerAfter = await db
        .collection<AnswerDocument>("answer")
        .findOne({ id: "answer-1" });
      const gradeAfter = await db
        .collection<GradeDocument>("grade")
        .findOne({ id: "grade-1" });

      // toEqual over toMatchObject: subset matching would miss an added field
      // or an extra row; _id is Mongo-injected, so pin it as expect.anything().
      expect(answerAfter).toEqual({ ...answerDoc, _id: expect.anything() });
      expect(gradeAfter).toEqual({ ...gradeDoc, _id: expect.anything() });
    },
  );

  dbIt(
    "rewrites a single_select question's options, preserving ids for options that are kept and minting a fresh id only for the genuinely new one (Step 27 / D53)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = (await service.addQuestion("test-1", {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      })) as SingleSelectQuestion;
      const [parisId, londonId] = question.options.map((o) => o.id);

      await service.updateQuestion(
        question.id,
        {
          options: [
            // Kept option: same id, corrected text.
            { id: parisId, text: "Paris (fixed typo)", isCorrect: true },
            { id: londonId, text: "London", isCorrect: false },
            // Genuinely new option: no id supplied.
            { text: "Berlin", isCorrect: false },
          ],
        },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];

      expect(updated.options).toHaveLength(3);
      expect(updated.options.find((o) => o.id === parisId)?.text).toBe(
        "Paris (fixed typo)",
      );
      expect(updated.options.find((o) => o.id === londonId)?.text).toBe(
        "London",
      );
      const newOption = updated.options.find(
        (o) => o.id !== parisId && o.id !== londonId,
      );
      expect(newOption?.text).toBe("Berlin");
    },
  );

  dbIt(
    "rejects an options edit that leaves a single_select question with no correct option (Step 27 — the MC rule is re-run, not bypassed)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = (await service.addQuestion("test-1", {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      })) as SingleSelectQuestion;
      const [parisId, londonId] = question.options.map((o) => o.id);

      await expect(
        service.updateQuestion(
          question.id,
          {
            options: [
              { id: parisId, text: "Paris", isCorrect: false },
              { id: londonId, text: "London", isCorrect: false },
            ],
          },
          "admin-2",
        ),
      ).rejects.toThrow(
        "single_select question must have exactly one correct option",
      );

      const [unchanged] = (await service.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];
      expect(unchanged.options.find((o) => o.id === parisId)?.isCorrect).toBe(
        true,
      );
    },
  );
});

describe("updateQuestion — a teacher changes a question's type (Step 28 / D46)", () => {
  dbIt(
    "switches a free_text question into single_select, clearing fields the new type cannot hold while keeping the shared explanation (Step 28 / D54)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
        explanation: "Newton's law of universal gravitation.",
        answerRevealMode: "diff",
      });

      await service.updateQuestion(
        question.id,
        {
          type: "single_select",
          options: [
            { text: "Force", isCorrect: true },
            { text: "Energy", isCorrect: false },
          ],
        },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];
      expect(updated.type).toBe("single_select");
      expect(updated.options.map((o) => o.text)).toEqual(["Force", "Energy"]);
      // free_text-only fields cannot survive on an MC document (D54). Read
      // the raw doc, not the mapped Question — toQuestion's MC branch never
      // emits referenceAnswer regardless of what's actually stored, so
      // asserting on `updated` would pass even if the clear never ran.
      const doc = await db
        .collection<QuestionDocument>("question")
        .findOne({ id: question.id });
      expect(doc?.referenceAnswer).toBeNull();
      // explanation is shared by free_text and MC, so it is NOT cleared.
      expect(updated.explanation).toBe(
        "Newton's law of universal gravitation.",
      );
    },
  );

  dbIt(
    "switches a single_select question back to free_text, clearing its options and grading strategy (Step 28 / D54)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
        // Non-default so the raw-doc assertion below is meaningful — the
        // default "all_or_nothing" would leave the field already stored as
        // `null` (addQuestion only stores what's given), making a
        // toBeNull() check pass whether or not the clear actually ran.
        mcGradingStrategy: "partial",
        explanation: "Paris is the capital of France.",
      });

      await service.updateQuestion(
        question.id,
        { type: "free_text" },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as FreeTextQuestion[];
      expect(updated.type).toBe("free_text");
      // Read the raw doc, not the mapped Question — toQuestion's free_text
      // branch never emits `options` regardless of what's stored, so this
      // is the only way to prove MC→free_text clearing actually ran.
      const doc = await db
        .collection<QuestionDocument>("question")
        .findOne({ id: question.id });
      expect(doc?.options).toBeNull();
      expect(doc?.mcGradingStrategy).toBeNull();
      // Shared field survives the switch away from MC too.
      expect(updated.explanation).toBe("Paris is the capital of France.");
    },
  );

  dbIt(
    "rejects switching a question into single_select without providing a valid option set (Step 28 — no valid intermediate state)",
    async ({ db }) => {
      const service = new QuestionService(db);

      const question = await service.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await expect(
        service.updateQuestion(
          question.id,
          { type: "single_select" },
          "admin-2",
        ),
      ).rejects.toThrow(
        "single_select question must have exactly one correct option",
      );

      const [unchanged] = await service.listQuestions("test-1");
      expect(unchanged.type).toBe("free_text");
    },
  );

  dbIt(
    "does not touch options or type when neither is part of the input (Step 28 — absent-key pin, e.g. a title-only correction)",
    async ({ db }) => {
      const service = new QuestionService(db);

      // A keyless MC question (D32/D44) — an update that never mentions
      // type/options must not re-run the MC rule against it and fail.
      const question = await service.addQuestion(
        "test-1",
        {
          title: "Pick one",
          content: "Choose.",
          createdBy: "admin-1",
          type: "single_select",
          options: [
            { text: "A", isCorrect: false },
            { text: "B", isCorrect: false },
          ],
        },
        { allowMissingAnswerKey: true },
      );

      await service.updateQuestion(
        question.id,
        { title: "Pick one (revised)" },
        "admin-2",
      );

      const [updated] = (await service.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];
      expect(updated.title).toBe("Pick one (revised)");
      expect(updated.options.every((o) => !o.isCorrect)).toBe(true);
    },
  );
});

describe("updateQuestion — records a change-log entry (Step 24 / D48)", () => {
  dbIt(
    "logs the changed fields, their before/after values and the current answered-student count",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const testService = new TestService(db);
      const testStartService = new TestStartService(db);
      const questionService = new QuestionService(db, changeLogService);
      const answerService = new AnswerService(
        db,
        questionService,
        testService,
        testStartService,
      );
      // `getAnswerService` is a lazy getter (see the constructor's own
      // JSDoc) — here it just always resolves to the one instance above.
      const questionServiceWithLogging = new QuestionService(
        db,
        changeLogService,
        () => Promise.resolve(answerService),
      );

      const question = await questionServiceWithLogging.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      // Two distinct students have answered by the time the edit happens.
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Attempt" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-2",
        answer: { type: "free_text", text: "Attempt" },
      });

      await questionServiceWithLogging.updateQuestion(
        question.id,
        { referenceAnswer: "Objects with mass attract each other." },
        "admin-2",
      );

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });

      expect(row).toMatchObject({
        questionId: question.id,
        testId: "test-1",
        changedBy: "admin-2",
        action: "update",
        changedFields: ["referenceAnswer"],
        before: { referenceAnswer: null },
        after: { referenceAnswer: "Objects with mass attract each other." },
        answeredStudentCount: 2,
      });
    },
  );

  dbIt(
    "writes no row when the save doesn't actually change anything",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const questionService = new QuestionService(db, changeLogService);

      const question = await questionService.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Same answer",
      });

      // Same value the question already holds — nothing actually changes.
      await questionService.updateQuestion(
        question.id,
        { referenceAnswer: "Same answer" },
        "admin-2",
      );

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });

      expect(row).toBeNull();
    },
  );

  dbIt(
    "logs a type change together with the before-value of a field it cleared, so a mis-click is recoverable by hand (Step 28 / D54)",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const questionService = new QuestionService(db, changeLogService);

      const question = await questionService.addQuestion("test-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
      });

      await questionService.updateQuestion(
        question.id,
        {
          type: "single_select",
          options: [
            { text: "Force", isCorrect: true },
            { text: "Energy", isCorrect: false },
          ],
        },
        "admin-2",
      );

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });

      expect(row).toMatchObject({
        action: "update",
        changedFields: expect.arrayContaining(["type", "referenceAnswer"]),
        before: {
          type: "free_text",
          referenceAnswer: "Objects with mass attract each other.",
        },
        after: { type: "single_select", referenceAnswer: null },
      });
    },
  );

  dbIt(
    "writes no row when an options save carries the same values, even though it's a new array reference (Step 27 — value comparison, not identity, for array fields)",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const questionService = new QuestionService(db, changeLogService);

      const question = (await questionService.addQuestion("test-1", {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      })) as SingleSelectQuestion;
      const [parisId, londonId] = question.options.map((o) => o.id);

      // A brand-new array object, but every option's id/text/isCorrect is
      // identical to what's already stored — a genuine no-op.
      await questionService.updateQuestion(
        question.id,
        {
          options: [
            { id: parisId, text: "Paris", isCorrect: true },
            { id: londonId, text: "London", isCorrect: false },
          ],
        },
        "admin-2",
      );

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });

      expect(row).toBeNull();
    },
  );

  dbIt(
    "reconstructs a stranded student's original option text from the change-log row after a real options edit through updateQuestion (Step 27 — D29/D48's core guarantee, proven end-to-end)",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const testService = new TestService(db);
      const testStartService = new TestStartService(db);
      const questionService = new QuestionService(db, changeLogService);
      const answerService = new AnswerService(
        db,
        questionService,
        testService,
        testStartService,
      );
      const questionServiceWithLogging = new QuestionService(
        db,
        changeLogService,
        () => Promise.resolve(answerService),
      );

      const question = (await questionServiceWithLogging.addQuestion("test-1", {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      })) as SingleSelectQuestion;
      const [parisId, londonId] = question.options.map((o) => o.id);

      // A student answers "London" — before the edit below, this is a
      // perfectly resolvable answer.
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [londonId] },
      });

      // The teacher removes "London" (the option the student chose) and adds
      // "Berlin" — through the real edit path, not a direct collection write.
      await questionServiceWithLogging.updateQuestion(
        question.id,
        {
          options: [
            { id: parisId, text: "Paris", isCorrect: true },
            { text: "Berlin", isCorrect: false },
          ],
        },
        "admin-2",
      );

      // The strand is real: the student's stored selection matches none of
      // the question's current options.
      const [current] = (await questionServiceWithLogging.listQuestions(
        "test-1",
      )) as SingleSelectQuestion[];
      expect(current.options.some((o) => o.id === londonId)).toBe(false);

      // Reconstruct the stranded answer's original option text from the log
      // row's `before.options` alone — no other code path can produce it
      // once the option is gone from the live document.
      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });
      const strandedOptions = row?.before.options as McOption[];
      const strandedOption = strandedOptions.find((o) => o.id === londonId);

      expect(strandedOption?.text).toBe("London");
    },
  );
});

describe("composeFromPools isolation (Step 22 — regression pin, no production change)", () => {
  dbIt(
    "editing a composed question does not change the pool question it was drawn from",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const poolQuestionService = new PoolQuestionService(db);

      const poolQuestion = await poolQuestionService.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
        explanation: "Newton's law of universal gravitation.",
        answerRevealMode: "diff",
      });

      const snapshots = await poolQuestionService.listSnapshotInputs("pool-1");
      const composed = await questionService.composeFromPools(
        "test-1",
        [{ count: 1, questions: snapshots }],
        "admin-2",
        (items, count) => items.slice(0, count),
      );

      // Edit the composed copy — new ids, no pool backlink, structurally
      // isolated from the pool per `composeFromPools`'s own doc comment.
      await questionService.updateQuestion(
        composed[0].id,
        {
          answerRevealMode: "plain",
          referenceAnswer: "A completely different model answer.",
          explanation: "A completely different explanation.",
        },
        "admin-3",
      );

      const [poolAfter] = await poolQuestionService.listPoolQuestions("pool-1");
      expect(poolAfter).toMatchObject({
        id: poolQuestion.id,
        referenceAnswer: "Objects with mass attract each other.",
        explanation: "Newton's law of universal gravitation.",
        answerRevealMode: "diff",
      });
    },
  );
});

describe("checkMcOptions — the shared MC option-count rule", () => {
  it("rejects a single_select with no correct option by default, matching today's rule", () => {
    const error = checkMcOptions("single_select", [
      { isCorrect: false },
      { isCorrect: false },
    ]);

    expect(error).toBe(
      "single_select question must have exactly one correct option",
    );
  });

  it("rejects a multi_select with no correct option by default, matching today's rule", () => {
    const error = checkMcOptions("multi_select", [
      { isCorrect: false },
      { isCorrect: false },
    ]);

    expect(error).toBe(
      "multi_select question must have at least one correct option",
    );
  });

  it("accepts a single_select with no correct option when allowMissingAnswerKey is true (D32)", () => {
    const error = checkMcOptions(
      "single_select",
      [{ isCorrect: false }, { isCorrect: false }],
      { allowMissingAnswerKey: true },
    );

    expect(error).toBeNull();
  });

  it("accepts a multi_select with no correct option when allowMissingAnswerKey is true (D32)", () => {
    const error = checkMcOptions(
      "multi_select",
      [{ isCorrect: false }, { isCorrect: false }],
      { allowMissingAnswerKey: true },
    );

    expect(error).toBeNull();
  });

  it("still rejects a single_select with two correct options even when allowMissingAnswerKey is true — a wrong key, not a missing one", () => {
    const error = checkMcOptions(
      "single_select",
      [{ isCorrect: true }, { isCorrect: true }],
      { allowMissingAnswerKey: true },
    );

    expect(error).toBe(
      "single_select question must have exactly one correct option",
    );
  });
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
    referenceAnswer: null,
    answerRevealMode: null,
    media: [],
  };
}
