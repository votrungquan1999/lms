import type { Db } from "mongodb";
import type {
  AiClient,
  AiGradeBatchInput,
  AiGradeBatchOptions,
  AiGradeBatchOutput,
} from "src/lib/ai/ai-client";
import {
  type RunnerClientProvider,
  RunnerClientResolutionKind,
} from "src/lib/ai/runner-settings";
import { AiGradeJobService } from "src/lib/ai-grade-job-service";
import { AiGradeService } from "src/lib/ai-grade-service";
import { AnnotationService } from "src/lib/annotation-service";
import { AnswerService } from "src/lib/answer-service";
import { CourseService } from "src/lib/course-service";
import { GradeService } from "src/lib/grade-service";
import { GradeVisibilityService } from "src/lib/grade-visibility-service";
import { QuestionChangeLogService } from "src/lib/question-change-log-service";
import { QuestionService } from "src/lib/question-service";
import { RedoRequestService } from "src/lib/redo-request-service";
import { TestService } from "src/lib/test-service";
import { TestStartService } from "src/lib/test-start-service";
import { TestSubmissionService } from "src/lib/test-submission-service";
import { TEST_SCHOOL_ID } from "./create-test-db";

/**
 * Core services constructed against an isolated test DB. Mirrors the wiring in
 * `services-singleton.ts` (lazy-thunk for `TestSubmissionService` to break the
 * GradeService ↔ TestSubmissionService cycle introduced by GradeVisibilityService).
 */
export interface CoreServices {
  questionService: QuestionService;
  questionChangeLogService: QuestionChangeLogService;
  answerService: AnswerService;
  testService: TestService;
  gradeVisibilityService: GradeVisibilityService;
  gradeService: GradeService;
  annotationService: AnnotationService;
  testSubmissionService: TestSubmissionService;
  testStartService: TestStartService;
  redoRequestService: RedoRequestService;
  aiGradeService: AiGradeService;
  aiGradeJobService: AiGradeJobService;
}

/**
 * Options accepted by `buildCoreServices`. Currently only the AI client seam.
 */
export interface BuildCoreServicesOptions {
  /** Inject a deterministic stub for service-level tests. */
  aiClient?: AiClient;
  /** Inject a runner client resolution; the default is no runner, so grading stays on the AI client. */
  runnerClientProvider?: RunnerClientProvider;
  /** Inject a controlled clock for deadline-enforcement tests. */
  now?: () => Date;
}

/**
 * Default no-op AI client for tests that don't exercise the AI path.
 * Throws to surface accidental real-AI calls during a test.
 */
class NoopAiClient implements AiClient {
  /**
   * Throws — tests that exercise the AI path MUST inject a stub via
   * `buildCoreServices(db, { aiClient })`.
   */
  async gradeFreeTextBatch(
    _items: AiGradeBatchInput[],
    _opts?: AiGradeBatchOptions,
  ): Promise<AiGradeBatchOutput[]> {
    throw new Error(
      "NoopAiClient: pass `{ aiClient }` to buildCoreServices to exercise AI grading paths.",
    );
  }
}

/**
 * Builds the wired-up core services for a test using the same lazy-thunk
 * pattern as `services-singleton.ts`.
 *
 * @param db - The isolated test database.
 * @param opts - Optional service overrides (currently only `aiClient`).
 */
export function buildCoreServices(
  db: Db,
  opts: BuildCoreServicesOptions = {},
): CoreServices {
  const questionChangeLogService = new QuestionChangeLogService(db);
  const testService = new TestService(
    db,
    TEST_SCHOOL_ID,
    new CourseService(db, TEST_SCHOOL_ID),
  );
  // Lazy thunk — AnswerService itself depends on QuestionService, so passing
  // an instance here would be a construction cycle (see QuestionService's
  // constructor JSDoc). Same shape as the testSubmissionService thunk below.
  let answerService!: AnswerService;
  const questionService = new QuestionService(
    db,
    testService,
    questionChangeLogService,
    () => Promise.resolve(answerService),
  );
  const testStartService = new TestStartService(db);
  answerService = new AnswerService(
    db,
    questionService,
    testService,
    testStartService,
    opts.now,
  );
  let testSubmissionService!: TestSubmissionService;
  const gradeVisibilityService = new GradeVisibilityService(testService, () =>
    Promise.resolve(testSubmissionService),
  );
  const gradeService = new GradeService(
    db,
    questionService,
    answerService,
    gradeVisibilityService,
    testService,
  );
  const annotationService = new AnnotationService(db, testService);
  const redoRequestService = new RedoRequestService(db, testService);
  testSubmissionService = new TestSubmissionService(
    db,
    gradeService,
    testService,
    testStartService,
    redoRequestService,
    opts.now,
  );

  const aiClient: AiClient = opts.aiClient ?? new NoopAiClient();
  const aiGradeJobService = new AiGradeJobService(db, TEST_SCHOOL_ID);
  const aiGradeService = new AiGradeService(
    db,
    aiClient,
    questionService,
    answerService,
    gradeService,
    testService,
    opts.runnerClientProvider ??
      (() => ({ kind: RunnerClientResolutionKind.Disabled })),
    aiGradeJobService,
  );

  return {
    questionService,
    questionChangeLogService,
    answerService,
    testService,
    gradeVisibilityService,
    gradeService,
    annotationService,
    testSubmissionService,
    testStartService,
    redoRequestService,
    aiGradeService,
    aiGradeJobService,
  };
}
