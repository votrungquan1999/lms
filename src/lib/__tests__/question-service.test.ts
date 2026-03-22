import {
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

  dbIt(
    "should add a question with raw markdown content",
    async ({ db }) => {
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
    },
  );

  dbIt(
    "should assign increasing order numbers",
    async ({ db }) => {
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
    },
  );

  dbIt(
    "should list questions ordered by order field",
    async ({ db }) => {
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
    },
  );

  dbIt(
    "should bulk import questions with correct ordering",
    async ({ db }) => {
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
    },
  );

  dbIt(
    "should continue ordering after existing questions",
    async ({ db }) => {
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
    },
  );

  dbIt(
    "should return empty array when importing nothing",
    async ({ db }) => {
      const service = new QuestionService(db);

      const result = await service.importQuestions("test-1", [], "admin-1");

      expect(result).toHaveLength(0);
    },
  );
});
