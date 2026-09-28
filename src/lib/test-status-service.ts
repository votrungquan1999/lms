import type { AnswerService } from "./answer-service";
import type { GradeService } from "./grade-service";
import type { QuestionService } from "./question-service";
import type { TestService } from "./test-service";
import type { TestStartService } from "./test-start-service";
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
 * Whether the student has pressed Submit, so an unanswered question is now a
 * blank that counts as 0 rather than one they may still answer.
 * @param status - The student's derived test status.
 * @returns True for Submitted and Graded.
 */
export function hasSubmitted(status: TestStatus): boolean {
  return status === TestStatus.Submitted || status === TestStatus.Graded;
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
    private readonly testStartService: TestStartService,
    private readonly testService: TestService,
    private readonly questionService: QuestionService,
  ) {}

  /**
   * Derives the test status for a student.
   *
   * An answer to a since-deleted question is dropped before any of the
   * branches below see it — it counts as never given, whether the test was
   * submitted or not, so the badge always agrees with the live-question
   * answered count a progress bar or grading view derives separately.
   *
   * - not_started: no live answers, not explicitly submitted, and (for a
   *   timed test) no active start record
   * - in_progress: not explicitly submitted, and either some live questions
   *   are answered or a timed test's clock has started — only pressing
   *   Submit moves past this
   * - submitted: student explicitly submitted the test and answered at
   *   least one live question that still needs a grade row
   * - graded: test was explicitly submitted AND every live question the
   *   student answered has a grade row. Blanks need no grade row — they
   *   score 0 by convention — so an entirely blank submission is Graded
   *   too, unless the test is practice (practice tests never grade, so a
   *   blank practice submission stays Submitted).
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
    // An answer to a since-deleted question is gone for everyone — it must
    // not count toward either the Graded transition or the In Progress
    // check below, or a student's progress bar and status badge disagree.
    const liveQuestionIds = new Set(
      (await this.questionService.listQuestions(testId)).map((q) => q.id),
    );
    const liveAnswers = answers.filter((a) =>
      liveQuestionIds.has(a.questionId),
    );

    const isSubmitted = await this.testSubmissionService.isTestSubmitted(
      testId,
      studentId,
    );

    if (isSubmitted) {
      if (liveAnswers.length === 0) {
        // Practice tests never create grades, so a blank practice submission
        // is exempt from the all-blank-is-Graded rule — it reads Submitted
        // forever, same as an answered practice submission.
        const test = await this.testService.getTest(testId);
        if (test?.isPractice) {
          return TestStatus.Submitted;
        }
        // A submitted-but-entirely-blank test is Graded, not stuck at
        // Submitted forever — every question counts as 0 by convention.
        return TestStatus.Graded;
      }
      const grades = await this.gradeService.getGrades(testId, studentId);
      const gradedQuestionIds = new Set(grades.map((g) => g.questionId));
      const everyAnsweredHasGrade = liveAnswers.every((a) =>
        gradedQuestionIds.has(a.questionId),
      );
      return everyAnsweredHasGrade ? TestStatus.Graded : TestStatus.Submitted;
    }

    if (liveAnswers.length === 0) {
      const activeStart = await this.testStartService.getActiveStart(
        testId,
        studentId,
      );
      return activeStart ? TestStatus.InProgress : TestStatus.NotStarted;
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
