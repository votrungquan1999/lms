import type { TestServices } from "./render-server-page";

/**
 * Sets a test's practice flag and resets its other settings to the ones a new test gets.
 * @param s - The page-test services.
 * @param testId - The test to change.
 * @param isPractice - Whether the test is practice.
 */
export async function setTestPractice(
  s: TestServices,
  testId: string,
  isPractice: boolean,
): Promise<void> {
  await s.testService.updateTestSettings(testId, {
    showGradeAfterSubmit: true,
    showCorrectAnswerAfterSubmit: true,
    timeLimitMinutes: null,
    isPractice,
    answerRevealMode: "plain",
    updatedBy: "admin",
  });
}

/**
 * Seeds a course whose practice test has one single-select question, answered correctly and handed in by an enrolled student, then makes the test normal. The hand-in was made while the test was practice, so its choice answer has no mark.
 * @param s - The page-test services.
 */
export async function seedUnmarkedChoiceHandIn(s: TestServices) {
  const course = await s.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await s.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: "admin",
    isPractice: true,
  });
  const question = await s.questionService.addQuestion(test.id, {
    type: "single_select",
    title: "Capital",
    content: "Capital",
    createdBy: "admin",
    options: [
      { text: "Right", isCorrect: true },
      { text: "Wrong", isCorrect: false },
    ],
  });
  const ann = await s.studentService.createStudentDocument({
    authUserId: "auth-ann",
    username: "ann",
    name: "Ann",
    createdBy: "admin",
  });
  await s.enrollmentService.enrollStudent(course.id, ann.id, "admin");
  const rightId = (
    question.type === "single_select" ? question.options : []
  ).find((o) => o.isCorrect)?.id as string;
  await s.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: ann.id,
    answer: { type: "mc", selectedIds: [rightId] },
  });
  await s.testSubmissionService.submitTest(test.id, ann.id);
  await setTestPractice(s, test.id, false);
  const normalTest = await s.testService.requireTest(test.id);
  return { course, test: normalTest, question, ann };
}
