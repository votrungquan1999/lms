import type { QuestionService } from "src/lib/question-service";
import type { Test, TestService } from "src/lib/test-service";

/**
 * Resolves the test through the school-bound service and verifies it belongs
 * to the given course. A foreign test and a missing test get the identical
 * refusal, so the caller can never tell another school's id exists.
 * @param testService - The acting admin's school-bound test service.
 * @param testId - The test the entry point was asked to act on.
 * @param courseId - The course the entry point was opened under.
 * @throws "Test not found" when the test is missing, foreign, or under a different course.
 */
export async function resolveOwnedTest(
  testService: TestService,
  testId: string,
  courseId: string,
): Promise<Test> {
  const test = await testService.getTest(testId);
  if (!test || test.courseId !== courseId) {
    throw new Error("Test not found");
  }
  return test;
}

/**
 * A question belongs to a test when its id is among that test's own
 * (non-deleted) questions, so `QuestionService` keeps its id-only signatures.
 * @param questionService - The acting admin's school-bound question service.
 * @param testId - The already-verified owning test (see {@link resolveOwnedTest}).
 * @param questionId - The question the entry point was asked to act on.
 * @throws "Question not found" when the question isn't among the test's own questions.
 */
export async function assertQuestionInTest(
  questionService: QuestionService,
  testId: string,
  questionId: string,
): Promise<void> {
  const questions = await questionService.listQuestions(testId);
  if (!questions.some((question) => question.id === questionId)) {
    throw new Error("Question not found");
  }
}
