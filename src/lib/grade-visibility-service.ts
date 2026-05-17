import type { TestService } from "./test-service";
import { TestStatus } from "./test-status-service";
import type { TestSubmissionService } from "./test-submission-service";

/**
 * GradeVisibilityService — owns the cross-service decision of whether a
 * student's grades for a test should be visible to them.
 *
 * The three reveal tiers (any one opens the gate):
 *   1. `Test.showGradeAfterSubmit` (global per-test flag)
 *   2. `Test.gradesReleasedAt` (global per-test release timestamp)
 *   3. `activeSubmission.releasedAt` (per-student release timestamp on the
 *      submission row)
 *
 * Extracted from `GradeService` to avoid a singleton-construction cycle.
 *
 * **Lazy `TestSubmissionService` dependency:** `TestSubmissionService` already
 * depends on `GradeService` (for `autoGradeTest` on submit), and `GradeService`
 * now depends on this service — so if we held an *instance* of
 * `TestSubmissionService` here the singleton init order would be cyclic. The
 * constructor instead takes a thunk that resolves the service on demand. By
 * the time `canRevealGrades` is called, `GradeService` is already cached, so
 * the thunk can construct `TestSubmissionService` safely:
 *
 *   getGradeService           → getGradeVisibilityService  (eager)
 *   getGradeVisibilityService → getTestService             (eager)
 *                              + getTestSubmissionService  (deferred via thunk)
 *   getTestSubmissionService  → getGradeService            (cached by now)
 */
export class GradeVisibilityService {
  constructor(
    private readonly testService: TestService,
    private readonly resolveTestSubmissionService: () => Promise<TestSubmissionService>,
  ) {}

  /**
   * Returns true iff the test is in the Graded status AND any one of the
   * three reveal tiers is satisfied for this student.
   */
  async canRevealGrades(
    testId: string,
    studentId: string,
    testStatus: TestStatus,
  ): Promise<boolean> {
    if (testStatus !== TestStatus.Graded) return false;
    const test = await this.testService.getTest(testId);
    if (!test) return false;
    if (test.showGradeAfterSubmit) return true;
    if (test.gradesReleasedAt) return true;
    const testSubmissionService = await this.resolveTestSubmissionService();
    const active = await testSubmissionService.getActiveSubmission(
      testId,
      studentId,
    );
    if (active?.releasedAt) return true;
    return false;
  }
}
