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
  constructor(
    private readonly answerService: AnswerService,
    private readonly testSubmissionService: TestSubmissionService,
    private readonly gradeService: GradeService,
  ) {}

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

  /**
   * Returns the count of students in each status for a single test.
   *
   * Result always contains all four TestStatus keys (zero-initialised).
   * Caller is responsible for passing deduplicated studentIds.
   */
  async getStatusCounts(
    testId: string,
    studentIds: string[],
    totalQuestions: number,
  ): Promise<Record<TestStatus, number>> {
    const counts: Record<TestStatus, number> = {
      [TestStatus.NotStarted]: 0,
      [TestStatus.InProgress]: 0,
      [TestStatus.Submitted]: 0,
      [TestStatus.Graded]: 0,
    };

    const statuses = await Promise.all(
      studentIds.map((studentId) =>
        this.getStatus(testId, studentId, totalQuestions),
      ),
    );

    for (const status of statuses) {
      counts[status]++;
    }

    return counts;
  }
}
