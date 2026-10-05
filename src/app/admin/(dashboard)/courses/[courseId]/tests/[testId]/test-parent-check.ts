import type { EnrollmentService } from "src/lib/enrollment-service";
import type { QuestionService } from "src/lib/question-service";
import {
  getEnrollmentService,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";
import type { Test, TestService } from "src/lib/test-service";

/** The ids a grading write names: the student's work on a test, maybe one question. */
export interface GradingTarget {
  testId: string;
  courseId: string;
  studentId: string;
  /** Checked whenever present — a write aimed at one question carries it. */
  questionId?: string;
}

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

/**
 * A write aimed at one student needs that student enrolled in the
 * already-verified test's course. Catches a foreign-school student (even one
 * a legacy enrolment row names) and a same-school student never added to
 * this course with the same check.
 * @param enrollmentService - The acting admin's school-bound enrollment service.
 * @param courseId - The already-verified owning test's `courseId`.
 * @param studentId - The student the entry point was asked to act on.
 * @throws "Student not found" when the student isn't enrolled in courseId.
 */
async function assertStudentEnrolled(
  enrollmentService: EnrollmentService,
  courseId: string,
  studentId: string,
): Promise<void> {
  const enrolled = await enrollmentService.isEnrolled(courseId, studentId);
  if (!enrolled) {
    throw new Error("Student not found");
  }
}

/**
 * The full check every grading write runs before touching anything: the test
 * is this school's and under `courseId`, the question (when named) is the
 * test's own, and the student is enrolled in the test's course.
 * @param schoolId - The acting admin's school.
 * @param target - The ids the write names; a parsed form can be passed as is.
 * @throws "Test not found", "Question not found" or "Student not found".
 */
export async function assertGradingTarget(
  schoolId: string,
  target: GradingTarget,
): Promise<void> {
  const test = await resolveOwnedTest(
    await getTestService(schoolId),
    target.testId,
    target.courseId,
  );
  if (target.questionId !== undefined) {
    await assertQuestionInTest(
      await getQuestionService(schoolId),
      target.testId,
      target.questionId,
    );
  }
  await assertStudentEnrolled(
    await getEnrollmentService(schoolId),
    test.courseId,
    target.studentId,
  );
}
