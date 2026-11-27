import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import type { GradingScreenRead } from "src/lib/grading-screen-read";
import type { Student } from "src/lib/student-service";
import type { Test } from "src/lib/test-service";
import { TEST_SCHOOL_ID } from "./create-test-db";
import { getTestServices } from "./render-server-page";

/**
 * The props By question's detail takes for one student, with the grading
 * screen's read built from the test's real services.
 * @param input - The test, its course and the one student on screen.
 * @param input.questionId - The question on screen.
 * @returns Props to pass to `GradingDetailQuestion`.
 */
export async function questionDetailProps(input: {
  test: Test;
  courseId: string;
  questionId: string;
  student: { id: string; name: string; username: string };
}) {
  const { test, student } = input;
  const services = getTestServices();
  const questions = await services.questionService.listQuestions(test.id);
  const question = questions.find((q) => q.id === input.questionId);
  if (!question) throw new Error("Question not found");
  const status = await services.testStatusService.getStatus(
    test.id,
    student.id,
    questions.length,
  );
  const answers = await services.answerService.getLatestAnswers(
    test.id,
    student.id,
  );
  const grades = await services.gradeService.getGrades(test.id, student.id);
  const screen = {
    questions,
    students: [student as unknown as Student],
    counts: null,
    pairs: new Map([
      [
        student.id,
        {
          testId: test.id,
          studentId: student.id,
          status,
          answersLeft: 0,
          submittedAt: null,
          gradedHidden: false,
          assumedHandIn: false,
          redoRequested: false,
        },
      ],
    ]),
    answers: new Map([
      [student.id, new Map(answers.map((a) => [a.questionId, a]))],
    ]),
    grades: new Map([
      [student.id, new Map(grades.map((g) => [g.questionId, g]))],
    ]),
  } satisfies GradingScreenRead;
  return {
    test,
    courseId: input.courseId,
    schoolId: TEST_SCHOOL_ID,
    question,
    student,
    routeKind: GradingRouteKind.Hub,
    screen,
  };
}
