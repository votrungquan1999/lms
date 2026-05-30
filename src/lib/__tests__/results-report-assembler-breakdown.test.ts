import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";
import { createAlice, makeAssembler } from "./results-report-assembler.helpers";

const dbIt = withTestDb(it);

describe("ResultsReportAssembler.buildReport — per-question breakdown", () => {
  dbIt(
    "breaks down a free-text question with its title, resolved answer text, score, and feedback",
    async ({ db }) => {
      // Given a selected test with an ordered free-text question the student
      // answered, graded 8 with feedback "Good".
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        gradeService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const q = await questionService.addQuestion(test.id, {
        title: "Explain X",
        content: "?",
        createdBy: "admin-1",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "My answer" },
      });
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        score: 8,
        feedback: "Good",
        gradedBy: "admin-1",
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then that test's questions has length 1 and shows the breakdown.
      const breakdown = report.tests[0].questions;
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].title).toBe("Explain X");
      expect(breakdown[0].answer).toEqual(["My answer"]);
      expect(breakdown[0].score).toBe(8);
      expect(breakdown[0].feedback).toBe("Good");
    },
  );

  dbIt(
    "resolves a multiple-choice answer to the selected option labels, not raw ids",
    async ({ db }) => {
      // Given a selected test with a single-select MC question whose options
      // are labeled, and the student selected the "Paris" option.
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        gradeService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const q = await questionService.addQuestion(test.id, {
        type: "single_select",
        title: "Capital of France?",
        content: "?",
        createdBy: "admin-1",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      });
      const parisId = q.options.find((o) => o.text === "Paris")?.id ?? "";
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        answer: { type: "mc", selectedIds: [parisId] },
      });
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        score: 10,
        feedback: "Correct",
        gradedBy: "admin-1",
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the resolved answer is the human-readable label, and score and
      // feedback match what was recorded.
      const breakdown = report.tests[0].questions;
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].answer).toEqual(["Paris"]);
      expect(breakdown[0].answer).not.toContain(parisId);
      expect(breakdown[0].score).toBe(10);
      expect(breakdown[0].feedback).toBe("Correct");
    },
  );

  dbIt(
    "lists the breakdown questions in the test's defined question order",
    async ({ db }) => {
      // Given a selected test with three questions added in a defined order.
      const { assembler, studentService, testService, questionService } =
        makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      await questionService.addQuestion(test.id, {
        title: "First",
        content: "?",
        createdBy: "admin-1",
      });
      await questionService.addQuestion(test.id, {
        title: "Second",
        content: "?",
        createdBy: "admin-1",
      });
      await questionService.addQuestion(test.id, {
        title: "Third",
        content: "?",
        createdBy: "admin-1",
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the breakdown lists exactly 3 questions in that same order.
      const breakdown = report.tests[0].questions;
      expect(breakdown).toHaveLength(3);
      expect(breakdown.map((q) => q.title)).toEqual([
        "First",
        "Second",
        "Third",
      ]);
    },
  );
});
