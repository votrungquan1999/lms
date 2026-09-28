import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { MongoClient as MongoClientCtor } from "mongodb";
import { GeminiAiClient } from "src/lib/ai/ai-client";
import { AiGradeService } from "src/lib/ai-grade-service";
import { AnnotationService } from "src/lib/annotation-service";
import { AnswerService } from "src/lib/answer-service";
import { CourseJoinRequestService } from "src/lib/course-join-request-service";
import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { GradeService } from "src/lib/grade-service";
import { GradeVisibilityService } from "src/lib/grade-visibility-service";
import { PageGuard } from "src/lib/page-guard";
import { PoolQuestionService } from "src/lib/pool-question-service";
import { QuestionChangeLogService } from "src/lib/question-change-log-service";
import { QuestionPoolService } from "src/lib/question-pool-service";
import { QuestionService } from "src/lib/question-service";
import { RedoRequestService } from "src/lib/redo-request-service";
import type { S3StorageService } from "src/lib/s3-storage-service";
import { SchoolDirectory } from "src/lib/school-directory";
import { type SchoolDocument, SchoolService } from "src/lib/school-service";
import { AdminSession, type Session } from "src/lib/session";
import { StudentService } from "src/lib/student-service";
import { TestFeedbackService } from "src/lib/test-feedback-service";
import { TestService } from "src/lib/test-service";
import { TestStartService } from "src/lib/test-start-service";
import { TestStatusService } from "src/lib/test-status-service";
import { TestSubmissionService } from "src/lib/test-submission-service";
import { UserRoleService } from "src/lib/user-role-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "./create-test-db";

/**
 * Real services constructed against a per-test isolated MongoDB.
 * Returned by setupServerPageTest and exposed to mock factories via getTestServices.
 */
export interface TestServices {
  aiGradeService: AiGradeService;
  annotationService: AnnotationService;
  answerService: AnswerService;
  courseJoinRequestService: CourseJoinRequestService;
  courseService: CourseService;
  enrollmentService: EnrollmentService;
  gradeService: GradeService;
  gradeVisibilityService: GradeVisibilityService;
  pageGuard: PageGuard;
  poolQuestionService: PoolQuestionService;
  questionChangeLogService: QuestionChangeLogService;
  questionPoolService: QuestionPoolService;
  questionService: QuestionService;
  redoRequestService: RedoRequestService;
  s3StorageService: S3StorageService;
  schoolDirectory: SchoolDirectory;
  schoolService: SchoolService;
  studentService: StudentService;
  testFeedbackService: TestFeedbackService;
  testService: TestService;
  testStartService: TestStartService;
  testStatusService: TestStatusService;
  testSubmissionService: TestSubmissionService;
  userRoleService: UserRoleService;
}

/** Services built for one school — one set per school in the harness. */
interface SchoolBoundServices {
  aiGradeService: AiGradeService;
  answerService: AnswerService;
  courseJoinRequestService: CourseJoinRequestService;
  courseService: CourseService;
  gradeService: GradeService;
  gradeVisibilityService: GradeVisibilityService;
  poolQuestionService: PoolQuestionService;
  questionPoolService: QuestionPoolService;
  questionService: QuestionService;
  redoRequestService: RedoRequestService;
  studentService: StudentService;
  testService: TestService;
  testStatusService: TestStatusService;
  testSubmissionService: TestSubmissionService;
}

/** Services shared by every school — one instance per test database. */
type SharedServices = Omit<TestServices, keyof SchoolBoundServices>;

interface TestDbHandle {
  client: MongoClient;
  db: Db;
}

let currentDb: TestDbHandle | null = null;
let currentShared: SharedServices | null = null;
let currentSchools: Map<string, SchoolBoundServices> | null = null;
// PageGuard's harness session. Default: the default school's admin (set in
// setupTestDb); tests opt into anyone else with signInAs().
let currentSession: Session | null = null;
let currentIsAdminEmail = false;

/** The admin every test is signed in as unless it calls signInAs(). */
function defaultSchoolAdminSession(): AdminSession {
  return new AdminSession({
    userId: "0000000000000000000000a1",
    email: "test-admin@example.com",
    school: TEST_SCHOOL,
  });
}

/**
 * Signs the harness's PageGuard in as `session` — the single source every
 * `requireXLogin`/`requireSchoolAdmin` call reads from for the rest of the
 * test. `isAdminEmail` defaults to false (most tests aren't the owner).
 */
export function signInAs(
  session: Session,
  options: { isAdminEmail?: boolean } = {},
): void {
  currentSession = session;
  currentIsAdminEmail = options.isAdminEmail ?? false;
}

/**
 * Builds the services shared by every school. A single PageGuard keeps one
 * `currentSession` for the whole test.
 */
function makeSharedServices(db: Db): SharedServices {
  const questionChangeLogService = new QuestionChangeLogService(db);
  const testStartService = new TestStartService(db);
  const annotationService = new AnnotationService(db);
  const enrollmentService = new EnrollmentService(db);
  const testFeedbackService = new TestFeedbackService(db);
  const pageGuard = new PageGuard(enrollmentService, {
    getSession: async () => currentSession,
    isAdminEmail: async () => currentIsAdminEmail,
  });
  const userRoleService = new UserRoleService(db);
  const schoolService = new SchoolService(db);
  const schoolDirectory = new SchoolDirectory(db);
  // Deterministic fake S3 service — no AWS SDK pulled into jsdom (type-only import).
  const s3StorageService = {
    getPresignedUploadUrl: async (key: string, _contentType: string) => ({
      key,
      url: `https://fake-s3.local/put/${key}`,
    }),
    getPresignedDownloadUrl: async (key: string, _ttlSeconds?: number) =>
      `https://fake-s3.local/get/${key}`,
  } as unknown as S3StorageService;

  return {
    annotationService,
    enrollmentService,
    pageGuard,
    questionChangeLogService,
    s3StorageService,
    schoolDirectory,
    schoolService,
    testFeedbackService,
    testStartService,
    userRoleService,
  };
}

/**
 * Builds one school's bound services. Construction order follows
 * `services-singleton.ts`, so a dependent is never built from another
 * school's instance.
 */
function makeSchoolServices(
  db: Db,
  schoolId: string,
  shared: SharedServices,
): SchoolBoundServices {
  const { questionChangeLogService, testStartService } = shared;
  const courseService = new CourseService(db, schoolId);
  const courseJoinRequestService = new CourseJoinRequestService(db, schoolId);
  const studentService = new StudentService(db, schoolId);
  const questionPoolService = new QuestionPoolService(db, schoolId);
  const poolQuestionService = new PoolQuestionService(
    db,
    schoolId,
    questionChangeLogService,
  );
  const testService = new TestService(db, schoolId);
  // Lazy thunk — AnswerService itself depends on QuestionService, so passing
  // an instance here would be a construction cycle (see QuestionService's
  // constructor JSDoc, and the TestSubmissionService thunk just below).
  let answerService!: AnswerService;
  const questionService = new QuestionService(
    db,
    questionChangeLogService,
    () => Promise.resolve(answerService),
  );
  answerService = new AnswerService(
    db,
    questionService,
    testService,
    testStartService,
  );
  // Wire the three-way cycle the same way `services-singleton.ts` does: the
  // GradeVisibilityService holds a thunk for TestSubmissionService instead of
  // an instance, so we can build TSS *after* GradeService. See the service's
  // JSDoc for the full cycle breakdown.
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
  );
  const testStatusService = new TestStatusService(
    answerService,
    testSubmissionService,
    gradeService,
    testStartService,
    testService,
    questionService,
  );
  // Real Gemini wrapper — service-page tests that exercise the AI path must
  // override `getAiGradeService` directly in their own `vi.mock(...)` factory.
  const aiGradeService = new AiGradeService(
    db,
    new GeminiAiClient(),
    questionService,
    answerService,
    gradeService,
  );
  const redoRequestService = new RedoRequestService(db, testService);

  return {
    aiGradeService,
    answerService,
    courseJoinRequestService,
    courseService,
    gradeService,
    gradeVisibilityService,
    poolQuestionService,
    questionPoolService,
    questionService,
    redoRequestService,
    studentService,
    testService,
    testStatusService,
    testSubmissionService,
  };
}

/**
 * Spins up a fresh isolated MongoDB and constructs real services against it.
 * Call inside `beforeEach` of a server-component test suite.
 */
export async function setupTestDb(): Promise<{
  db: Db;
  services: TestServices;
}> {
  const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
  const dbName = `lms-test-${randomUUID()}`;

  const client = new MongoClientCtor(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  // Inserted raw so the default school keeps its fixed, exported id.
  await db.collection<SchoolDocument>("school").insertOne({
    id: TEST_SCHOOL.id,
    name: TEST_SCHOOL.name,
    slug: "test-school",
    createdAt: new Date(),
    createdBy: "test-harness",
  });

  currentDb = { client, db };
  currentShared = makeSharedServices(db);
  currentSchools = new Map([
    [TEST_SCHOOL_ID, makeSchoolServices(db, TEST_SCHOOL_ID, currentShared)],
  ]);
  currentSession = defaultSchoolAdminSession();

  return { db, services: getTestServices() };
}

/**
 * Creates another school in the test database and builds its bound
 * services, for isolation tests that act as a non-default school's admin.
 * @param name - The new school's name.
 * @returns The school as sessions carry it.
 */
export async function addTestSchool(
  name = "Other School",
): Promise<{ id: string; name: string }> {
  if (!currentDb || !currentShared || !currentSchools) {
    throw new Error("addTestSchool called before setupTestDb.");
  }
  const school = await currentShared.schoolService.createSchool({
    name,
    slug: `school-${randomUUID()}`,
    createdBy: "test-harness",
  });
  currentSchools.set(
    school.id,
    makeSchoolServices(currentDb.db, school.id, currentShared),
  );
  return { id: school.id, name: school.name };
}

/**
 * Drops the test database and closes the connection.
 * Call inside `afterEach` of a server-component test suite.
 */
export async function teardownTestDb(): Promise<void> {
  if (!currentDb) return;
  await currentDb.client.db(currentDb.db.databaseName).dropDatabase();
  await currentDb.client.close();
  currentDb = null;
  currentShared = null;
  currentSchools = null;
  currentSession = null;
  currentIsAdminEmail = false;
}

/**
 * Returns one school's services merged with the shared ones — the default
 * test school's when no school is given, so existing seeds stay unchanged.
 * Throws outside a setupTestDb/teardownTestDb window or for an unknown school.
 * @param schoolId - The school whose bound services to return.
 */
export function getTestServices(schoolId = TEST_SCHOOL_ID): TestServices {
  if (!currentShared || !currentSchools) {
    throw new Error(
      "getTestServices called before setupTestDb. Add `beforeEach(setupTestDb)` to your test suite.",
    );
  }
  const bound = currentSchools.get(schoolId);
  if (!bound) {
    throw new Error(
      `No test school "${schoolId}". Create it with addTestSchool().`,
    );
  }
  return { ...currentShared, ...bound };
}

/**
 * The mocked getters' lookup: unlike getTestServices it has no default
 * school, so a call missing its school fails instead of reading the default.
 * @param schoolId - The school the production caller passed.
 */
function servicesForSchool(schoolId: string): TestServices {
  if (!schoolId) {
    throw new Error("A school is required — mocked getters have no default.");
  }
  return getTestServices(schoolId);
}

/**
 * Returns a factory object suitable for `vi.mock("src/lib/services-singleton", servicesSingletonMockFactory)`.
 * Each getter lazily reads from the current test's service container.
 */
export function servicesSingletonMockFactory() {
  return {
    getAiGradeService: async (schoolId: string) =>
      servicesForSchool(schoolId).aiGradeService,
    getAnnotationService: async () => getTestServices().annotationService,
    getAnswerService: async (schoolId: string) =>
      servicesForSchool(schoolId).answerService,
    getCourseJoinRequestService: async (schoolId: string) =>
      servicesForSchool(schoolId).courseJoinRequestService,
    getCourseService: async (schoolId: string) =>
      servicesForSchool(schoolId).courseService,
    getEnrollmentService: async () => getTestServices().enrollmentService,
    getGradeService: async (schoolId: string) =>
      servicesForSchool(schoolId).gradeService,
    getGradeVisibilityService: async (schoolId: string) =>
      servicesForSchool(schoolId).gradeVisibilityService,
    getPageGuard: async () => getTestServices().pageGuard,
    getPoolQuestionService: async (schoolId: string) =>
      servicesForSchool(schoolId).poolQuestionService,
    getQuestionChangeLogService: async () =>
      getTestServices().questionChangeLogService,
    getQuestionPoolService: async (schoolId: string) =>
      servicesForSchool(schoolId).questionPoolService,
    getQuestionService: async (schoolId: string) =>
      servicesForSchool(schoolId).questionService,
    getRedoRequestService: async (schoolId: string) =>
      servicesForSchool(schoolId).redoRequestService,
    getS3StorageService: async () => getTestServices().s3StorageService,
    getSchoolDirectory: async () => getTestServices().schoolDirectory,
    getSchoolService: async () => getTestServices().schoolService,
    getStudentService: async (schoolId: string) =>
      servicesForSchool(schoolId).studentService,
    getTestFeedbackService: async () => getTestServices().testFeedbackService,
    getTestService: async (schoolId: string) =>
      servicesForSchool(schoolId).testService,
    getTestStartService: async () => getTestServices().testStartService,
    getTestStatusService: async (schoolId: string) =>
      servicesForSchool(schoolId).testStatusService,
    getTestSubmissionService: async (schoolId: string) =>
      servicesForSchool(schoolId).testSubmissionService,
    getUserRoleService: async () => getTestServices().userRoleService,
  };
}
