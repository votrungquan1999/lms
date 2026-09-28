import { headers } from "next/headers";
import { GeminiAiClient, type QuestionParseClient } from "./ai/ai-client";
import { AiGradeService } from "./ai-grade-service";
import { AnnotationService } from "./annotation-service";
import { AnswerService } from "./answer-service";
import { getAuthService } from "./auth-singleton";
import { loadConfig } from "./config";
import { CourseJoinRequestService } from "./course-join-request-service";
import { CourseService } from "./course-service";
import { getDatabase } from "./database";
import { EnrollmentService } from "./enrollment-service";
import { GradeService } from "./grade-service";
import { GradeVisibilityService } from "./grade-visibility-service";
import { tracedService } from "./observability/traced-service";
import { PageGuard } from "./page-guard";
import { PoolQuestionService } from "./pool-question-service";
import { QuestionChangeLogService } from "./question-change-log-service";
import { QuestionPoolService } from "./question-pool-service";
import { QuestionService } from "./question-service";
import { RedoRequestService } from "./redo-request-service";
import { S3StorageService } from "./s3-storage-service";
import { SchoolDirectory } from "./school-directory";
import { SchoolService } from "./school-service";
import { StudentService } from "./student-service";
import { TestFeedbackService } from "./test-feedback-service";
import { TestService } from "./test-service";
import { TestStartService } from "./test-start-service";
import { TestStatusService } from "./test-status-service";
import { TestSubmissionService } from "./test-submission-service";
import { UserRoleService } from "./user-role-service";

/**
 * Lazy singletons for domain services.
 * Uses the shared database connection from database.ts.
 */

// One instance per school: a school-bound service never serves another school,
// and a dependent is only ever built from its own school's instances.
const aiGradeServices = new Map<string, AiGradeService>();
const answerServices = new Map<string, AnswerService>();
const courseServices = new Map<string, CourseService>();
const gradeServices = new Map<string, GradeService>();
const gradeVisibilityServices = new Map<string, GradeVisibilityService>();
const questionServices = new Map<string, QuestionService>();
const redoRequestServices = new Map<string, RedoRequestService>();
const studentServices = new Map<string, StudentService>();
const testServices = new Map<string, TestService>();
const testStatusServices = new Map<string, TestStatusService>();
const testSubmissionServices = new Map<string, TestSubmissionService>();

let courseJoinRequestService: CourseJoinRequestService | null = null;
let enrollmentService: EnrollmentService | null = null;
let annotationService: AnnotationService | null = null;
let testStartService: TestStartService | null = null;
let testFeedbackService: TestFeedbackService | null = null;
let questionChangeLogService: QuestionChangeLogService | null = null;
let questionParseClient: QuestionParseClient | null = null;
let questionPoolService: QuestionPoolService | null = null;
let poolQuestionService: PoolQuestionService | null = null;
let s3StorageService: S3StorageService | null = null;
let schoolDirectory: SchoolDirectory | null = null;
let schoolService: SchoolService | null = null;
let pageGuard: PageGuard | null = null;
let userRoleService: UserRoleService | null = null;

/**
 * Returns the school's instance from `cache`, building it on first use.
 * @param cache - One service's per-school instances.
 * @param schoolId - The verified session's school.
 * @param build - Builds the instance from that school's own dependencies.
 */
async function forSchool<T>(
  cache: Map<string, T>,
  schoolId: string,
  build: () => Promise<T>,
): Promise<T> {
  // Refused before any cache or database access, so an unset school never
  // gets a service that could match unassigned records.
  if (!schoolId) {
    throw new Error("A school is required to get a school-bound service");
  }
  let service = cache.get(schoolId);
  if (!service) {
    service = await build();
    cache.set(schoolId, service);
  }
  return service;
}

/**
 * Builds PageGuard's real session lookup: reads `headers()` and the
 * real `AuthService` itself, so PageGuard's own methods stay framework- and
 * auth-singleton-free.
 */
function realPageGuardSessionLookup() {
  return {
    async getSession() {
      const requestHeaders = await headers();
      const authService = await getAuthService();
      return authService.getSession(requestHeaders);
    },
    async isAdminEmail(email: string) {
      const authService = await getAuthService();
      return authService.isAdminEmail(email);
    },
  };
}

export async function getPageGuard(): Promise<PageGuard> {
  if (!pageGuard) {
    const enrollment = await getEnrollmentService();
    pageGuard = tracedService(
      new PageGuard(enrollment, realPageGuardSessionLookup()),
      "pageGuard",
    );
  }
  return pageGuard;
}

/**
 * Returns the school's `AiGradeService` wired against the live Gemini client.
 * Tests inject a stub via `buildCoreServices(db, { aiClient })` — they never
 * call this getter.
 * @param schoolId - The verified session's school.
 */
export async function getAiGradeService(
  schoolId: string,
): Promise<AiGradeService> {
  return forSchool(aiGradeServices, schoolId, async () => {
    const db = await getDatabase();
    const questionService = await getQuestionService(schoolId);
    const answerService = await getAnswerService(schoolId);
    const gradeService = await getGradeService(schoolId);
    return tracedService(
      new AiGradeService(
        db,
        new GeminiAiClient(),
        questionService,
        answerService,
        gradeService,
      ),
      "aiGrade",
    );
  });
}

/**
 * Returns the school's `AnswerService`, built on that school's tests.
 * @param schoolId - The verified session's school.
 */
export async function getAnswerService(
  schoolId: string,
): Promise<AnswerService> {
  return forSchool(answerServices, schoolId, async () => {
    const db = await getDatabase();
    const qs = await getQuestionService(schoolId);
    const ts = await getTestService(schoolId);
    const tss = await getTestStartService();
    return tracedService(new AnswerService(db, qs, ts, tss), "answer");
  });
}

export async function getCourseJoinRequestService(): Promise<CourseJoinRequestService> {
  if (!courseJoinRequestService) {
    const db = await getDatabase();
    courseJoinRequestService = tracedService(
      new CourseJoinRequestService(db),
      "courseJoinRequest",
    );
  }
  return courseJoinRequestService;
}

/**
 * Returns the course service bound to one school, cached per school.
 * @param schoolId - The verified session's school.
 */
export async function getCourseService(
  schoolId: string,
): Promise<CourseService> {
  return forSchool(courseServices, schoolId, async () => {
    const db = await getDatabase();
    return tracedService(new CourseService(db, schoolId), "course");
  });
}

export async function getEnrollmentService(): Promise<EnrollmentService> {
  if (!enrollmentService) {
    const db = await getDatabase();
    enrollmentService = tracedService(new EnrollmentService(db), "enrollment");
  }
  return enrollmentService;
}

/**
 * Returns the school's `GradeService`.
 * @param schoolId - The verified session's school.
 */
export async function getGradeService(schoolId: string): Promise<GradeService> {
  return forSchool(gradeServices, schoolId, async () => {
    const db = await getDatabase();
    const questionService = await getQuestionService(schoolId);
    const answerService = await getAnswerService(schoolId);
    const visibility = await getGradeVisibilityService(schoolId);
    return tracedService(
      new GradeService(db, questionService, answerService, visibility),
      "grade",
    );
  });
}

export async function getAnnotationService(): Promise<AnnotationService> {
  if (!annotationService) {
    const db = await getDatabase();
    annotationService = tracedService(new AnnotationService(db), "annotation");
  }
  return annotationService;
}

/**
 * Returns the school's `GradeVisibilityService`. Constructed AFTER
 * `TestService` and `TestSubmissionService`, BEFORE `GradeService` —
 * keeps the dependency graph acyclic (see the service's class JSDoc).
 * @param schoolId - The verified session's school.
 */
export async function getGradeVisibilityService(
  schoolId: string,
): Promise<GradeVisibilityService> {
  return forSchool(gradeVisibilityServices, schoolId, async () => {
    const testService = await getTestService(schoolId);
    // Lazy thunk — see `GradeVisibilityService` JSDoc for the cycle reasoning.
    return tracedService(
      new GradeVisibilityService(testService, () =>
        getTestSubmissionService(schoolId),
      ),
      "gradeVisibility",
    );
  });
}

/**
 * Returns the test service bound to one school, cached per school.
 * @param schoolId - The verified session's school.
 */
export async function getTestService(schoolId: string): Promise<TestService> {
  return forSchool(testServices, schoolId, async () => {
    const db = await getDatabase();
    return tracedService(new TestService(db, schoolId), "test");
  });
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

/**
 * Returns the school's `TestSubmissionService`.
 * @param schoolId - The verified session's school.
 */
export async function getTestSubmissionService(
  schoolId: string,
): Promise<TestSubmissionService> {
  return forSchool(testSubmissionServices, schoolId, async () => {
    const db = await getDatabase();
    return tracedService(
      new TestSubmissionService(
        db,
        await getGradeService(schoolId),
        await getTestService(schoolId),
        await getTestStartService(),
      ),
      "testSubmission",
    );
  });
}

/**
 * Returns the school's `TestStatusService`.
 * @param schoolId - The verified session's school.
 */
export async function getTestStatusService(
  schoolId: string,
): Promise<TestStatusService> {
  return forSchool(testStatusServices, schoolId, async () => {
    const answers = await getAnswerService(schoolId);
    const submissions = await getTestSubmissionService(schoolId);
    const grades = await getGradeService(schoolId);
    const starts = await getTestStartService();
    const tests = await getTestService(schoolId);
    const questions = await getQuestionService(schoolId);
    return tracedService(
      new TestStatusService(
        answers,
        submissions,
        grades,
        starts,
        tests,
        questions,
      ),
      "testStatus",
    );
  });
}

/**
 * Returns the school's `QuestionService`. Constructed WITH a lazy
 * `getAnswerService` thunk, not an instance — `AnswerService` itself depends
 * on `QuestionService`, so passing an instance here would be a construction
 * cycle. Same shape as `getGradeVisibilityService`'s `getTestSubmissionService`
 * thunk above.
 * @param schoolId - The verified session's school.
 */
export async function getQuestionService(
  schoolId: string,
): Promise<QuestionService> {
  return forSchool(questionServices, schoolId, async () => {
    const db = await getDatabase();
    const changeLogService = await getQuestionChangeLogService();
    return tracedService(
      new QuestionService(db, changeLogService, () =>
        getAnswerService(schoolId),
      ),
      "question",
    );
  });
}

export async function getQuestionChangeLogService(): Promise<QuestionChangeLogService> {
  if (!questionChangeLogService) {
    const db = await getDatabase();
    questionChangeLogService = tracedService(
      new QuestionChangeLogService(db),
      "questionChangeLog",
    );
  }
  return questionChangeLogService;
}

/**
 * Returns the singleton `QuestionParseClient` wired against the live Gemini
 * client. No database state, so unlike `getAiGradeService` there is no
 * intervening domain service — the action layer calls this directly.
 */
export async function getQuestionParseClient(): Promise<QuestionParseClient> {
  if (!questionParseClient) {
    questionParseClient = new GeminiAiClient();
  }
  return questionParseClient;
}

export async function getPoolQuestionService(): Promise<PoolQuestionService> {
  if (!poolQuestionService) {
    const db = await getDatabase();
    const changeLogService = await getQuestionChangeLogService();
    poolQuestionService = tracedService(
      new PoolQuestionService(db, changeLogService),
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

/**
 * Returns the platform-wide directory, for lookups that must see every
 * school (invite links, student usernames and sign-in accounts).
 */
export async function getSchoolDirectory(): Promise<SchoolDirectory> {
  if (!schoolDirectory) {
    const db = await getDatabase();
    schoolDirectory = tracedService(new SchoolDirectory(db), "schoolDirectory");
  }
  return schoolDirectory;
}

export async function getSchoolService(): Promise<SchoolService> {
  if (!schoolService) {
    const db = await getDatabase();
    schoolService = tracedService(new SchoolService(db), "school");
  }
  return schoolService;
}

/**
 * Returns the student service bound to one school, cached per school.
 * @param schoolId - The verified session's school.
 */
export async function getStudentService(
  schoolId: string,
): Promise<StudentService> {
  return forSchool(studentServices, schoolId, async () => {
    const db = await getDatabase();
    return tracedService(new StudentService(db, schoolId), "student");
  });
}

/**
 * Returns the school's `RedoRequestService`.
 * @param schoolId - The verified session's school.
 */
export async function getRedoRequestService(
  schoolId: string,
): Promise<RedoRequestService> {
  return forSchool(redoRequestServices, schoolId, async () => {
    const db = await getDatabase();
    return tracedService(
      new RedoRequestService(db, await getTestService(schoolId)),
      "redoRequest",
    );
  });
}

export async function getTestStartService(): Promise<TestStartService> {
  if (!testStartService) {
    const db = await getDatabase();
    testStartService = tracedService(new TestStartService(db), "testStart");
  }
  return testStartService;
}

export async function getUserRoleService(): Promise<UserRoleService> {
  if (!userRoleService) {
    const db = await getDatabase();
    userRoleService = tracedService(new UserRoleService(db), "userRole");
  }
  return userRoleService;
}
