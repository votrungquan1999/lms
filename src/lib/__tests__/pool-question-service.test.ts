import {
  type PoolFreeTextQuestion,
  type PoolQuestionDocument,
  PoolQuestionService,
  type PoolSingleSelectQuestion,
} from "src/lib/pool-question-service";
import { QuestionChangeLogService } from "src/lib/question-change-log-service";
import { MediaContentType, QuestionService } from "src/lib/question-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("PoolQuestionService", () => {
  dbIt(
    "stores a free-text question scoped to the pool with default weight and order",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = await service.addPoolQuestion("pool-1", {
        title: "Explain recursion",
        content: "Describe a base case.",
        createdBy: "admin-1",
      });

      expect(question.type).toBe("free_text");
      expect(question.poolId).toBe("pool-1");
      expect(question.order).toBe(1);
      expect(question.weight).toBe(1);
      expect(question.media).toEqual([]);
    },
  );

  dbIt(
    "stores a single-select question with exactly one correct option, assigning option ids",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = await service.addPoolQuestion("pool-1", {
        type: "single_select",
        title: "Capital of France",
        content: "Pick one",
        createdBy: "admin-1",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "Berlin", isCorrect: false },
        ],
      });

      expect(question.type).toBe("single_select");
      if (question.type !== "single_select") throw new Error("type narrow");
      expect(question.options).toHaveLength(2);
      expect(question.options.every((o) => o.id.length > 0)).toBe(true);
      expect(question.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(question.mcGradingStrategy).toBe("all_or_nothing");
    },
  );

  dbIt(
    "persists and reads back an explanation on a single_select pool question, including via listSnapshotInputs",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      await service.addPoolQuestion("pool-1", {
        type: "single_select",
        title: "Capital of France",
        content: "Pick one",
        createdBy: "admin-1",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "Berlin", isCorrect: false },
        ],
        explanation: "Paris has been the capital since the 12th century.",
      });

      const [question] = (await service.listPoolQuestions(
        "pool-1",
      )) as PoolSingleSelectQuestion[];
      const [snapshot] = await service.listSnapshotInputs("pool-1");

      expect(question.explanation).toBe(
        "Paris has been the capital since the 12th century.",
      );
      expect(snapshot.explanation).toBe(
        "Paris has been the capital since the 12th century.",
      );
    },
  );

  dbIt(
    "persists and reads back an answerRevealMode override on a free_text pool question via both listPoolQuestions and listSnapshotInputs, leaving it absent when omitted",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      await service.addPoolQuestion("pool-1", {
        title: "Explain photosynthesis",
        content: "Write a short paragraph.",
        createdBy: "admin-1",
        answerRevealMode: "plain",
      });
      await service.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "Write a short paragraph.",
        createdBy: "admin-1",
      });

      const [withOverride, withoutOverride] = (await service.listPoolQuestions(
        "pool-1",
      )) as PoolFreeTextQuestion[];
      const [snapWith, snapWithout] =
        await service.listSnapshotInputs("pool-1");

      expect(withOverride.answerRevealMode).toBe("plain");
      expect(withoutOverride.answerRevealMode).toBeUndefined();
      // listSnapshotInputs is the sole production bridge into composeFromPools —
      // a missed field here is invisible to any test that only reads via
      // listPoolQuestions above.
      expect(snapWith.answerRevealMode).toBe("plain");
      expect(snapWithout.answerRevealMode).toBeNull();
    },
  );

  dbIt(
    "lists a pool's questions ordered by their order, excluding other pools' questions",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const first = await service.addPoolQuestion("pool-1", {
        title: "Q1",
        content: "first",
        createdBy: "admin-1",
      });
      const second = await service.addPoolQuestion("pool-1", {
        title: "Q2",
        content: "second",
        createdBy: "admin-1",
      });
      await service.addPoolQuestion("pool-2", {
        title: "Other",
        content: "elsewhere",
        createdBy: "admin-1",
      });

      const questions = await service.listPoolQuestions("pool-1");

      expect(questions.map((q) => q.id)).toEqual([first.id, second.id]);
    },
  );

  // The following exercise branches already present in the mirrored
  // addPoolQuestion/validateMcOptions — no meaningful red is possible, so they
  // are green-from-first confirmation tests (per the project TDD rule).

  dbIt(
    "rejects a single-select question that has no correct option",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      await expect(
        service.addPoolQuestion("pool-1", {
          type: "single_select",
          title: "Bad",
          content: "no correct",
          createdBy: "admin-1",
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
    "rejects a multi-select question with no correct options and stores one with at least one",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      await expect(
        service.addPoolQuestion("pool-1", {
          type: "multi_select",
          title: "Bad",
          content: "none correct",
          createdBy: "admin-1",
          mcGradingStrategy: "partial",
          options: [{ text: "A", isCorrect: false }],
        }),
      ).rejects.toThrow(
        "multi_select question must have at least one correct option",
      );

      const ok = await service.addPoolQuestion("pool-1", {
        type: "multi_select",
        title: "Good",
        content: "some correct",
        createdBy: "admin-1",
        mcGradingStrategy: "partial",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
        ],
      });

      expect(ok.type).toBe("multi_select");
      if (ok.type !== "multi_select") throw new Error("type narrow");
      expect(ok.mcGradingStrategy).toBe("partial");
    },
  );

  dbIt(
    "stores a question's weight and its media keys, returning media with an empty url placeholder",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = await service.addPoolQuestion("pool-1", {
        title: "With media",
        content: "see image",
        createdBy: "admin-1",
        weight: 3,
        media: [
          {
            key: "pools/p1/img.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1234,
            fileName: "img.png",
          },
        ],
      });

      expect(question.weight).toBe(3);
      expect(question.media).toHaveLength(1);
      expect(question.media[0].key).toBe("pools/p1/img.png");
      expect(question.media[0].url).toBe("");
    },
  );

  dbIt(
    "projects pool questions as compose snapshot inputs with full media fields",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      await service.addPoolQuestion("pool-1", {
        type: "single_select",
        title: "Snapshot me",
        content: "body",
        createdBy: "admin-1",
        weight: 4,
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
        media: [
          {
            key: "pools/p1/m.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 999,
            fileName: "m.png",
          },
        ],
      });

      const snapshots = await service.listSnapshotInputs("pool-1");

      expect(snapshots).toHaveLength(1);
      const snap = snapshots[0];
      expect(snap.type).toBe("single_select");
      expect(snap.title).toBe("Snapshot me");
      expect(snap.weight).toBe(4);
      expect(snap.options?.filter((o) => o.isCorrect)).toHaveLength(1);
      // Full media doc fields are preserved (size + fileName, not just key).
      expect(snap.media[0]).toMatchObject({
        key: "pools/p1/m.png",
        size: 999,
        fileName: "m.png",
      });
    },
  );
});

describe("updatePoolQuestion — a teacher corrects a pool question (Step 30 / D30/D51)", () => {
  dbIt("corrects a pool question's title and content", async ({ db }) => {
    const service = new PoolQuestionService(db);

    const question = await service.addPoolQuestion("pool-1", {
      title: "Explain recursion",
      content: "Describe a base case.",
      createdBy: "admin-1",
    });

    await service.updatePoolQuestion(
      question.id,
      { title: "Explain recursion (revised)", content: "Two sentences." },
      "admin-2",
    );

    const [updated] = await service.listPoolQuestions("pool-1");
    expect(updated.title).toBe("Explain recursion (revised)");
    expect(updated.content).toBe("Two sentences.");
  });

  dbIt(
    "rewrites a single_select pool question's options, preserving ids for kept options and minting a fresh id for the new one (D53)",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = (await service.addPoolQuestion("pool-1", {
        type: "single_select",
        title: "Capital of France",
        content: "Pick one",
        createdBy: "admin-1",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      })) as PoolSingleSelectQuestion;
      const [parisId, londonId] = question.options.map((o) => o.id);

      await service.updatePoolQuestion(
        question.id,
        {
          options: [
            { id: parisId, text: "Paris (fixed)", isCorrect: true },
            { id: londonId, text: "London", isCorrect: false },
            { text: "Berlin", isCorrect: false },
          ],
        },
        "admin-2",
      );

      const [updated] = (await service.listPoolQuestions(
        "pool-1",
      )) as PoolSingleSelectQuestion[];
      expect(updated.options).toHaveLength(3);
      expect(updated.options.find((o) => o.id === parisId)?.text).toBe(
        "Paris (fixed)",
      );
      const newOption = updated.options.find(
        (o) => o.id !== parisId && o.id !== londonId,
      );
      expect(newOption?.text).toBe("Berlin");
    },
  );

  dbIt(
    "switches a pool question's type, clearing fields the new type cannot hold (D54)",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = await service.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
      });

      await service.updatePoolQuestion(
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

      const [updated] = (await service.listPoolQuestions(
        "pool-1",
      )) as PoolSingleSelectQuestion[];
      expect(updated.type).toBe("single_select");
      // Read the raw doc, not the mapped PoolQuestion — toPoolQuestion's
      // single_select branch never emits referenceAnswer regardless of
      // what's actually stored, so asserting on `updated` would pass even
      // if the clear never ran.
      const doc = await db
        .collection<PoolQuestionDocument>("pool_question")
        .findOne({ id: question.id });
      expect(doc?.referenceAnswer).toBeNull();
    },
  );

  dbIt(
    "rejects switching a pool question into single_select without a valid option set",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = await service.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await expect(
        service.updatePoolQuestion(
          question.id,
          { type: "single_select" },
          "admin-2",
        ),
      ).rejects.toThrow(
        "single_select question must have exactly one correct option",
      );
    },
  );

  dbIt(
    "records the edit in the change log with poolId set and testId null, and no answered-student count (Step 30 / D51 — pool questions have no answers)",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const service = new PoolQuestionService(db, changeLogService);

      const question = await service.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await service.updatePoolQuestion(
        question.id,
        { title: "Explain gravity (revised)" },
        "admin-2",
      );

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });

      expect(row).toMatchObject({
        action: "update",
        poolId: "pool-1",
        testId: null,
        changedBy: "admin-2",
        answeredStudentCount: 0,
      });
    },
  );
});

describe("deletePoolQuestion — a teacher removes a pool question (Step 30 / D37/D51)", () => {
  dbIt(
    "soft-deletes the question: excludes it from BOTH listPoolQuestions and listSnapshotInputs (Step 30 — the second read funnel)",
    async ({ db }) => {
      const service = new PoolQuestionService(db);

      const question = await service.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });
      await service.addPoolQuestion("pool-1", {
        title: "Explain osmosis",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await service.deletePoolQuestion(question.id, "admin-2");

      const remaining = await service.listPoolQuestions("pool-1");
      expect(remaining.map((q) => q.title)).toEqual(["Explain osmosis"]);

      // The trap the dispatch names explicitly: a deleted pool question must
      // not keep being composed into new tests via the SECOND read funnel.
      const snapshots = await service.listSnapshotInputs("pool-1");
      expect(snapshots.map((s) => s.title)).toEqual(["Explain osmosis"]);
    },
  );

  dbIt(
    "records the delete as its own change-log row carrying the whole question as before, with poolId set and testId null",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);
      const service = new PoolQuestionService(db, changeLogService);

      const question = await service.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      });

      await service.deletePoolQuestion(question.id, "admin-2");

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });

      expect(row).toMatchObject({
        action: "delete",
        poolId: "pool-1",
        testId: null,
        after: {},
      });
      expect(row?.before).toMatchObject({
        id: question.id,
        title: "Explain gravity",
      });
    },
  );
});

describe("pool→test isolation (Step 30 — regression pin)", () => {
  dbIt(
    "editing a pool question has no retroactive effect on a test question already composed from it (green from the first run — composed copies share no references with the pool)",
    async ({ db }) => {
      const poolQuestionService = new PoolQuestionService(db);
      const questionService = new QuestionService(db);

      const poolQuestion = await poolQuestionService.addPoolQuestion("pool-1", {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
      });

      const snapshots = await poolQuestionService.listSnapshotInputs("pool-1");
      const composed = await questionService.composeFromPools(
        "test-1",
        [{ count: 1, questions: snapshots }],
        "admin-2",
        (items, count) => items.slice(0, count),
      );

      // Edit the pool question AFTER composing — a completely different
      // wording than what the test copy was frozen with.
      await poolQuestionService.updatePoolQuestion(
        poolQuestion.id,
        {
          title: "Explain gravity (rewritten)",
          referenceAnswer: "A totally different model answer.",
        },
        "admin-3",
      );

      const [composedAfter] = await questionService.listQuestions("test-1");
      expect(composedAfter).toMatchObject({
        id: composed[0].id,
        title: "Explain gravity",
        referenceAnswer: "Objects with mass attract each other.",
      });
    },
  );
});
