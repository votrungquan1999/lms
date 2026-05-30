import type { Db } from "mongodb";
import type {
  AiClient,
  AiGradeBatchInput,
  AiGradeBatchOptions,
  AiGradeBatchOutput,
} from "src/lib/ai/ai-client";
import { AiGradeService } from "src/lib/ai-grade-service";
import { AnswerService } from "src/lib/answer-service";
import { GradeService } from "src/lib/grade-service";
import { GradeVisibilityService } from "src/lib/grade-visibility-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { TestStartService } from "src/lib/test-start-service";
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
  testStartService: TestStartService;
  aiGradeService: AiGradeService;
}

/**
 * Options accepted by `buildCoreServices`. Currently only the AI client seam.
 */
export interface BuildCoreServicesOptions {
  /** Inject a deterministic stub for service-level tests. */
  aiClient?: AiClient;
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
  const questionService = new QuestionService(db);
  const testService = new TestService(db);
  const testStartService = new TestStartService(db);
  const answerService = new AnswerService(
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
  );
  testSubmissionService = new TestSubmissionService(
    db,
    gradeService,
    testService,
    testStartService,
    opts.now,
  );

  const aiClient: AiClient = opts.aiClient ?? new NoopAiClient();
  const aiGradeService = new AiGradeService(
    db,
    aiClient,
    questionService,
    answerService,
    gradeService,
  );

  return {
    questionService,
    answerService,
    testService,
    gradeVisibilityService,
    gradeService,
    testSubmissionService,
    testStartService,
    aiGradeService,
  };
}
