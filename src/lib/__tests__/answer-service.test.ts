/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import { AnswerService } from "src/lib/answer-service";
import { QuestionService } from "src/lib/question-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

// ── Core answer behaviours ───────────────────────────────────────────────────

describe("AnswerService - Integration Tests", () => {
  dbIt(
    "should store MC answer as { type: 'mc', selectedIds } and free-text as { type: 'free_text', text }",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const mcQuestion = await questionService.addQuestion("test-1", {
        title: "MC Q",
        content: "Pick",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "Opt 1", isCorrect: true },
          { text: "Opt 2", isCorrect: false },
        ],
      });

      const ftQuestion = await questionService.addQuestion("test-1", {
        title: "FT Q",
        content: "Write",
        createdBy: "admin",
        type: "free_text",
      });

      const opt1 = mcQuestion.options[0].id;
      const opt2 = mcQuestion.options[1].id;

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: mcQuestion.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [opt1, opt2] },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: ftQuestion.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "My answer" },
      });

      const answers = await answerService.getLatestAnswers("test-1", "student-1");
      const mcAnswer = answers.find((a) => a.questionId === mcQuestion.id);
      const ftAnswer = answers.find((a) => a.questionId === ftQuestion.id);

      expect(mcAnswer?.answer).toEqual({ type: "mc", selectedIds: [opt1, opt2] });
      expect(ftAnswer?.answer).toEqual({ type: "free_text", text: "My answer" });
    },
  );

  dbIt(
    "should create a new answer record for a question",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const answer = await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "My answer to question 1" },
      });

      expect(answer.id).toBeDefined();
      expect(answer.testId).toBe("test-1");
      expect(answer.questionId).toBe("q-1");
      expect(answer.studentId).toBe("student-1");
      expect(answer.answer).toEqual({
        type: "free_text",
        text: "My answer to question 1",
      });
      expect(answer.submittedAt).toBeInstanceOf(Date);
    },
  );

  dbIt(
    "should preserve answer history (append-only model)",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const first = await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "First attempt" },
      });

      const second = await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "Revised answer" },
      });

      expect(first.id).not.toBe(second.id);
      expect(second.answer).toEqual({
        type: "free_text",
        text: "Revised answer",
      });
    },
  );

  dbIt(
    "should reject a duplicate submission when answer is identical to the latest",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "Same answer" },
      });

      await expect(
        answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: { type: "free_text", text: "Same answer" },
        }),
      ).rejects.toThrow("Answer is unchanged");
    },
  );

  dbIt(
    "should return only the latest answer per question via getLatestAnswers",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "First" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "Second" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        answer: { type: "free_text", text: "Only attempt for q2" },
      });

      const latest = await answerService.getLatestAnswers("test-1", "student-1");

      expect(latest).toHaveLength(2);
      const q1Answer = latest.find((a) => a.questionId === "q-1");
      const q2Answer = latest.find((a) => a.questionId === "q-2");
      expect(q1Answer?.answer).toEqual({ type: "free_text", text: "Second" });
      expect(q2Answer?.answer).toEqual({ type: "free_text", text: "Only attempt for q2" });
    },
  );

  dbIt(
    "should return empty array when no answers exist",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const latest = await answerService.getLatestAnswers("test-1", "student-1");
      expect(latest).toHaveLength(0);
    },
  );
});

// ── MC answer validation ─────────────────────────────────────────────────────

describe("AnswerService - MC Answer Validation", () => {
  dbIt(
    "rejects a single_select MC answer with no selected options",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const q = await questionService.addQuestion("test-mc", {
        title: "Q?",
        content: "Pick one.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      });

      await expect(
        answerService.submitAnswer({
          testId: "test-mc",
          questionId: q.id,
          studentId: "student-1",
          answer: { type: "mc", selectedIds: [] },
        }),
      ).rejects.toThrow("at least one selected option");
    },
  );

  dbIt(
    "rejects a single_select MC answer with a bogus option ID",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const q = await questionService.addQuestion("test-mc", {
        title: "Q?",
        content: "Pick one.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      });

      await expect(
        answerService.submitAnswer({
          testId: "test-mc",
          questionId: q.id,
          studentId: "student-1",
          answer: { type: "mc", selectedIds: ["does-not-exist"] },
        }),
      ).rejects.toThrow("invalid option IDs");
    },
  );

  dbIt(
    "rejects a multi_select MC answer with no selected options",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const q = await questionService.addQuestion("test-mc", {
        title: "Select all correct",
        content: "Pick.",
        createdBy: "admin",
        type: "multi_select",
        mcGradingStrategy: "partial",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
        ],
      });

      await expect(
        answerService.submitAnswer({
          testId: "test-mc",
          questionId: q.id,
          studentId: "student-1",
          answer: { type: "mc", selectedIds: [] },
        }),
      ).rejects.toThrow("at least one selected option");
    },
  );
});
