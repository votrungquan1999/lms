import type { SingleSelectQuestion } from "src/lib/question-service";
import { QuestionGradeStatus } from "src/lib/results-report-assembler";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawCourses } from "src/tests/raw-enrollment-seeds";
import { describe, expect, it } from "vitest";
import { createAlice, makeAssembler } from "./results-report-assembler.helpers";

const dbIt = withTestDb(it);

describe("ResultsReportAssembler.buildReport — expired attempt never handed in", () => {
  dbIt(
    "reports the auto-grade of the hand-in on the first build",
    async ({ db }) => {
      await insertRawCourses(db, ["course-1"]);
      // Given a 30-minute test whose attempt started two hours ago with a correct saved answer and no hand-in
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        testStartService,
      } = makeAssembler(db);
      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Timed",
        description: "",
        createdBy: "admin-1",
      });
      await testService.updateTestSettings(test.id, {
        showGradeAfterSubmit: true,
        showCorrectAnswerAfterSubmit: true,
        timeLimitMinutes: 30,
        isPractice: false,
        answerRevealMode: "diff",
        updatedBy: "admin-1",
      });
      const question = (await questionService.addQuestion(test.id, {
        title: "Q?",
        content: "Choose.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "A", isCorrect: false },
          { text: "B", isCorrect: true },
        ],
      })) as SingleSelectQuestion;
      await answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: alice.id,
        answer: {
          type: "mc",
          selectedIds: [question.options.find((o) => o.isCorrect)?.id ?? ""],
        },
      });
      await testStartService.recordStart(
        test.id,
        alice.id,
        new Date(Date.now() - 2 * 60 * 60_000),
      );

      // When the assembler builds the report
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the test score already carries the auto-grade
      expect(report.tests[0].score).toBe(100);
      expect(report.tests[0].gradeStatus).toBe(QuestionGradeStatus.Graded);
    },
  );
});
