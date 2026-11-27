import { needsGrade } from "src/lib/needs-grade";
import { TestStatusService } from "src/lib/test-status-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawCourses } from "src/tests/raw-enrollment-seeds";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const now = new Date();
const grade = { gradedAt: now, updatedAt: null };

describe("needsGrade", () => {
  it.each([
    ["an answer with no grade", true, null, true],
    ["a graded answer", true, grade, false],
    ["a blank answer", false, null, false],
    ["a grade on a question left blank", false, grade, false],
  ])("is decided for %s", (_label, answered, savedGrade, expected) => {
    expect(
      needsGrade({
        answered,
        latestAnswerAt: answered ? now : null,
        grade: savedGrade,
        redoOpen: false,
      }),
    ).toBe(expected);
  });

  dbIt(
    "agrees with the status service: a handed-in student is Submitted exactly when one live answer needs a grade",
    async ({ db }) => {
      await insertRawCourses(db, ["course-1"]);
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
        testStartService,
      } = buildCoreServices(db);
      const statusService = new TestStatusService(
        answerService,
        testSubmissionService,
        gradeService,
        testStartService,
        testService,
        questionService,
      );
      const test = await testService.createTest("course-1", {
        title: "Test",
        description: "",
        createdBy: "admin",
      });
      const added = [];
      for (const title of ["Q1", "Q2", "Q3"]) {
        added.push(
          await questionService.addQuestion(test.id, {
            type: "free_text",
            title,
            content: title,
            createdBy: "admin",
          }),
        );
      }
      const [a, b, c] = added;
      if (!a || !b || !c) throw new Error("questions not seeded");

      const answer = (studentId: string, questionId: string) =>
        answerService.submitAnswer({
          testId: test.id,
          questionId,
          studentId,
          answer: { type: "free_text", text: "x" },
        });
      const gradeIt = (studentId: string, questionId: string) =>
        gradeService.gradeQuestion({
          testId: test.id,
          questionId,
          studentId,
          score: 50,
          feedback: "",
          gradedBy: "teacher",
        });

      // Given: everything graded / one answer ungraded / blanks plus an ungraded answer on a deleted question
      await answer("all-graded", a.id);
      await answer("all-graded", b.id);
      await gradeIt("all-graded", a.id);
      await gradeIt("all-graded", b.id);
      await answer("one-waiting", a.id);
      await answer("one-waiting", b.id);
      await gradeIt("one-waiting", a.id);
      await answer("deleted-only", c.id);
      await questionService.deleteQuestion(test.id, c.id, "admin");
      for (const student of ["all-graded", "one-waiting", "deleted-only"]) {
        await testSubmissionService.submitTest(test.id, student);
      }
      const liveQuestions = await questionService.listQuestions(test.id);

      for (const student of ["all-graded", "one-waiting", "deleted-only"]) {
        // When: the rule is applied to each live question of the student
        const answers = new Map(
          (await answerService.getLatestAnswers(test.id, student)).map((x) => [
            x.questionId,
            x,
          ]),
        );
        const grades = new Map(
          (await gradeService.getGrades(test.id, student)).map((g) => [
            g.questionId,
            g,
          ]),
        );
        const anyNeeds = liveQuestions.some((q) =>
          needsGrade({
            answered: answers.has(q.id),
            latestAnswerAt: answers.get(q.id)?.submittedAt ?? null,
            grade: grades.get(q.id) ?? null,
            redoOpen: false,
          }),
        );

        // Then: it matches the status service
        const status = await statusService.getStatus(
          test.id,
          student,
          liveQuestions.length,
        );
        expect(status === "submitted").toBe(anyNeeds);
      }
    },
  );
});
