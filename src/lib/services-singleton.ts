import { GeminiAiClient } from "./ai/ai-client";
import { AiGradeService } from "./ai-grade-service";
import { AnswerService } from "./answer-service";
import { loadConfig } from "./config";
import { CourseService } from "./course-service";
import { getDatabase } from "./database";
import { EnrollmentService } from "./enrollment-service";
import { GradeService } from "./grade-service";
import { GradeVisibilityService } from "./grade-visibility-service";
import { tracedService } from "./observability/traced-service";
import { PageGuard } from "./page-guard";
import { PoolQuestionService } from "./pool-question-service";
import { QuestionPoolService } from "./question-pool-service";
import { QuestionService } from "./question-service";
import { RedoRequestService } from "./redo-request-service";
import { S3StorageService } from "./s3-storage-service";
import { StudentService } from "./student-service";
import { TestFeedbackService } from "./test-feedback-service";
import { TestService } from "./test-service";
import { TestStartService } from "./test-start-service";
import { TestStatusService } from "./test-status-service";
import { TestSubmissionService } from "./test-submission-service";

/**
 * Lazy singletons for domain services.
 * Uses the shared database connection from database.ts.
 */

let aiGradeService: AiGradeService | null = null;
let answerService: AnswerService | null = null;
let courseService: CourseService | null = null;
let enrollmentService: EnrollmentService | null = null;
let gradeService: GradeService | null = null;
let gradeVisibilityService: GradeVisibilityService | null = null;
let redoRequestService: RedoRequestService | null = null;
let testStartService: TestStartService | null = null;
let testService: TestService | null = null;
let testFeedbackService: TestFeedbackService | null = null;
let testStatusService: TestStatusService | null = null;
let testSubmissionService: TestSubmissionService | null = null;
let questionService: QuestionService | null = null;
let questionPoolService: QuestionPoolService | null = null;
let poolQuestionService: PoolQuestionService | null = null;
let s3StorageService: S3StorageService | null = null;
let studentService: StudentService | null = null;
let pageGuard: PageGuard | null = null;

export async function getPageGuard(): Promise<PageGuard> {
  if (!pageGuard) {
    const enrollment = await getEnrollmentService();
    pageGuard = tracedService(new PageGuard(enrollment), "pageGuard");
  }
  return pageGuard;
}

/**
 * Returns the singleton `AiGradeService` wired against the live Gemini client.
 * Tests inject a stub via `buildCoreServices(db, { aiClient })` — they never
 * call this getter.
 */
export async function getAiGradeService(): Promise<AiGradeService> {
  if (!aiGradeService) {
    const db = await getDatabase();
    const questionService = await getQuestionService();
    const answerService = await getAnswerService();
    const gradeService = await getGradeService();
    aiGradeService = tracedService(
      new AiGradeService(
        db,
        new GeminiAiClient(),
        questionService,
        answerService,
        gradeService,
      ),
      "aiGrade",
    );
  }
  return aiGradeService;
}

export async function getAnswerService(): Promise<AnswerService> {
  if (!answerService) {
    const db = await getDatabase();
    const qs = await getQuestionService();
    const ts = await getTestService();
    const tss = await getTestStartService();
    answerService = tracedService(new AnswerService(db, qs, ts, tss), "answer");
  }
  return answerService;
}

export async function getCourseService(): Promise<CourseService> {
  if (!courseService) {
    const db = await getDatabase();
    courseService = tracedService(new CourseService(db), "course");
  }
  return courseService;
}

export async function getEnrollmentService(): Promise<EnrollmentService> {
  if (!enrollmentService) {
    const db = await getDatabase();
    enrollmentService = tracedService(new EnrollmentService(db), "enrollment");
  }
  return enrollmentService;
}

export async function getGradeService(): Promise<GradeService> {
  if (!gradeService) {
    const db = await getDatabase();
    const questionService = await getQuestionService();
    const answerService = await getAnswerService();
    const visibility = await getGradeVisibilityService();
    gradeService = tracedService(
      new GradeService(db, questionService, answerService, visibility),
      "grade",
    );
  }
  return gradeService;
}

/**
 * Returns the singleton `GradeVisibilityService`. Constructed AFTER
 * `TestService` and `TestSubmissionService`, BEFORE `GradeService` —
 * keeps the dependency graph acyclic (see the service's class JSDoc).
 */
export async function getGradeVisibilityService(): Promise<GradeVisibilityService> {
  if (!gradeVisibilityService) {
    const testService = await getTestService();
    // Lazy thunk — see `GradeVisibilityService` JSDoc for the cycle reasoning.
    gradeVisibilityService = tracedService(
      new GradeVisibilityService(testService, getTestSubmissionService),
      "gradeVisibility",
    );
  }
  return gradeVisibilityService;
}

export async function getTestService(): Promise<TestService> {
  if (!testService) {
    const db = await getDatabase();
    testService = tracedService(new TestService(db), "test");
  }
  return testService;
}

export async function getTestFeedbackService(): Promise<TestFeedbackService> {
  if (!testFeedbackService) {
    const db = await getDatabase();
    testFeedbackService = tracedService(
      new TestFeedbackService(db),
      "testFeedback",
    );
  }
  return testFeedbackService;
}

export async function getTestSubmissionService(): Promise<TestSubmissionService> {
  if (!testSubmissionService) {
    const db = await getDatabase();
    testSubmissionService = tracedService(
      new TestSubmissionService(
        db,
        await getGradeService(),
        await getTestService(),
        await getTestStartService(),
      ),
      "testSubmission",
    );
  }
  return testSubmissionService;
}

export async function getTestStatusService(): Promise<TestStatusService> {
  if (!testStatusService) {
    const answers = await getAnswerService();
    const submissions = await getTestSubmissionService();
    const grades = await getGradeService();
    testStatusService = tracedService(
      new TestStatusService(answers, submissions, grades),
      "testStatus",
    );
  }
  return testStatusService;
}

export async function getQuestionService(): Promise<QuestionService> {
  if (!questionService) {
    const db = await getDatabase();
    questionService = tracedService(new QuestionService(db), "question");
  }
  return questionService;
}

export async function getPoolQuestionService(): Promise<PoolQuestionService> {
  if (!poolQuestionService) {
    const db = await getDatabase();
    poolQuestionService = tracedService(
      new PoolQuestionService(db),
      "poolQuestion",
    );
  }
  return poolQuestionService;
}

export async function getQuestionPoolService(): Promise<QuestionPoolService> {
  if (!questionPoolService) {
    const db = await getDatabase();
    questionPoolService = tracedService(
      new QuestionPoolService(db),
      "questionPool",
    );
  }
  return questionPoolService;
}

/**
 * Returns the singleton `S3StorageService`, built from S3 config (bucket/region/creds)
 * and the optional CloudFront delivery config (used to sign read URLs).
 */
export async function getS3StorageService(): Promise<S3StorageService> {
  if (!s3StorageService) {
    const config = loadConfig();
    s3StorageService = tracedService(
      new S3StorageService(config.s3, config.cloudfront),
      "s3Storage",
    );
  }
  return s3StorageService;
}

export async function getStudentService(): Promise<StudentService> {
  if (!studentService) {
    const db = await getDatabase();
    studentService = tracedService(new StudentService(db), "student");
  }
  return studentService;
}

export async function getRedoRequestService(): Promise<RedoRequestService> {
  if (!redoRequestService) {
    const db = await getDatabase();
    redoRequestService = tracedService(
      new RedoRequestService(db),
      "redoRequest",
    );
  }
  return redoRequestService;
}

export async function getTestStartService(): Promise<TestStartService> {
  if (!testStartService) {
    const db = await getDatabase();
    testStartService = tracedService(new TestStartService(db), "testStart");
  }
  return testStartService;
}
