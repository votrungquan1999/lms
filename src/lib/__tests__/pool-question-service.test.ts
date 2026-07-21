import {
  PoolQuestionService,
  type PoolSingleSelectQuestion,
} from "src/lib/pool-question-service";
import { MediaContentType } from "src/lib/question-service";
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
