import type { Db } from "mongodb";
import { AnswerService } from "src/lib/answer-service";
import { GradeService } from "src/lib/grade-service";
import { GradeVisibilityService } from "src/lib/grade-visibility-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { TestSubmissionService } from "src/lib/test-submission-service";

/**
 * Core services constructed against an isolated test DB. Mirrors the wiring in
 * `services-singleton.ts` (lazy-thunk for `TestSubmissionService` to break the
 * GradeService ↔ TestSubmissionService cycle introduced by GradeVisibilityService).
 */
export interface CoreServices {
  questionService: QuestionService;
  answerService: AnswerService;
  testService: TestService;
  gradeVisibilityService: GradeVisibilityService;
  gradeService: GradeService;
  testSubmissionService: TestSubmissionService;
}

/**
 * Builds the wired-up core services for a test using the same lazy-thunk
 * pattern as `services-singleton.ts`.
 */
export function buildCoreServices(db: Db): CoreServices {
  const questionService = new QuestionService(db);
  const answerService = new AnswerService(db, questionService);
  const testService = new TestService(db);
  let testSubmissionService!: TestSubmissionService;
  const gradeVisibilityService = new GradeVisibilityService(testService, () =>
    Promise.resolve(testSubmissionService),
  );
  const gradeService = new GradeService(
    db,
    questionService,
    answerService,
    gradeVisibilityService,
  );
  testSubmissionService = new TestSubmissionService(db, gradeService);

  return {
    questionService,
    answerService,
    testService,
    gradeVisibilityService,
    gradeService,
    testSubmissionService,
  };
}
