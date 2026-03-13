import type { AnswerService } from "./answer-service";
import type { GradeService } from "./grade-service";
import type { TestSubmissionService } from "./test-submission-service";

/**
 * Possible test statuses for a student.
 */
export enum TestStatus {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Submitted = "submitted",
  Graded = "graded",
}

/**
 * TestStatusService — derives the status of a test for a student
 * by combining data from AnswerService, TestSubmissionService, and GradeService.
 */
export class TestStatusService {
  private readonly answerService: AnswerService;
  private readonly testSubmissionService: TestSubmissionService;
  private readonly gradeService: GradeService;

  constructor(
    answerService: AnswerService,
    testSubmissionService: TestSubmissionService,
    gradeService: GradeService,
  ) {
    this.answerService = answerService;
    this.testSubmissionService = testSubmissionService;
    this.gradeService = gradeService;
  }

  /**
   * Derives the test status for a student.
   *
   * - not_started: no answers submitted
   * - in_progress: some answers submitted but test not explicitly submitted
   * - submitted: student explicitly submitted the test (or answered all questions)
   * - graded: all questions graded by teacher
   */
  async getStatus(
    testId: string,
    studentId: string,
    totalQuestions: number,
  ): Promise<TestStatus> {
    if (totalQuestions === 0) {
      return TestStatus.NotStarted;
    }

    const answers = await this.answerService.getLatestAnswers(
      testId,
      studentId,
    );

    if (answers.length === 0) {
      const isSubmitted = await this.testSubmissionService.isTestSubmitted(
        testId,
        studentId,
      );
      return isSubmitted ? TestStatus.Submitted : TestStatus.NotStarted;
    }

    // Check if all questions are graded
    const grades = await this.gradeService.getGrades(testId, studentId);
    if (grades.length >= totalQuestions) {
      return TestStatus.Graded;
    }

    // Check if explicitly submitted or all questions answered
    const isSubmitted = await this.testSubmissionService.isTestSubmitted(
      testId,
      studentId,
    );
    if (isSubmitted || answers.length >= totalQuestions) {
      return TestStatus.Submitted;
    }

    return TestStatus.InProgress;
  }
}
