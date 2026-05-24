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
   * - not_started: no answers submitted and not explicitly submitted
   * - in_progress: some answers submitted, fewer than total questions, and
   *   not explicitly submitted
   * - submitted: student explicitly submitted the test, or answered every
   *   question without an explicit submission
   * - graded: test was explicitly submitted AND every question the student
   *   *answered* has a grade row. Questions the student left blank do not
   *   need a grade row to reach this state — blanks score 0 by convention.
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

    const isSubmitted = await this.testSubmissionService.isTestSubmitted(
      testId,
      studentId,
    );

    if (answers.length === 0) {
      return isSubmitted ? TestStatus.Submitted : TestStatus.NotStarted;
    }

    if (isSubmitted) {
      const grades = await this.gradeService.getGrades(testId, studentId);
      const gradedQuestionIds = new Set(grades.map((g) => g.questionId));
      const everyAnsweredHasGrade = answers.every((a) =>
        gradedQuestionIds.has(a.questionId),
      );
      if (everyAnsweredHasGrade) {
        return TestStatus.Graded;
      }
      return TestStatus.Submitted;
    }

    if (answers.length >= totalQuestions) {
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
