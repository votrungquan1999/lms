import type { Db } from "mongodb";
import type { SingleSelectQuestion } from "src/lib/question-service";
import type { TestStartDocument } from "src/lib/test-start-service";
import type { TestServices } from "./render-server-page";

/**
 * Seeds a 30-minute test whose enrolled student answered its one MC question
 * correctly, started two hours ago and never handed in.
 * @param s - The page-test services.
 * @param db - The isolated test database.
 */
export async function seedExpiredNeverHandedIn(s: TestServices, db: Db) {
  const course = await s.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await s.testService.createTest(course.id, {
    title: "Timed",
    description: "",
    createdBy: "admin",
  });
  await s.testService.updateTestSettings(test.id, {
    showGradeAfterSubmit: true,
    showCorrectAnswerAfterSubmit: true,
    timeLimitMinutes: 30,
    isPractice: false,
    answerRevealMode: "diff",
    updatedBy: "admin",
  });
  const question = (await s.questionService.addQuestion(test.id, {
    title: "Q?",
    content: "Choose.",
    createdBy: "admin",
    type: "single_select",
    options: [
      { text: "A", isCorrect: false },
      { text: "B", isCorrect: true },
    ],
  })) as SingleSelectQuestion;
  const student = await s.studentService.createStudentDocument({
    authUserId: "auth-1",
    username: "stu",
    name: "Stu",
    createdBy: "admin",
  });
  await s.enrollmentService.enrollStudent(course.id, student.id, "admin");
  await s.testStartService.recordStart(test.id, student.id, new Date());
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: {
      type: "mc",
      selectedIds: [question.options.find((o) => o.isCorrect)?.id ?? ""],
    },
  });
  await db
    .collection<TestStartDocument>("test_start")
    .updateOne(
      { testId: test.id, studentId: student.id },
      { $set: { startedAt: new Date(Date.now() - 2 * 60 * 60_000) } },
    );
  return { course, test, student };
}
