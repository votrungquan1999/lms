import { randomUUID } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { MongoClient as MongoClientCtor } from "mongodb";
import { AnswerService } from "src/lib/answer-service";
import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { GradeService } from "src/lib/grade-service";
import { PageGuard } from "src/lib/page-guard";
import { QuestionService } from "src/lib/question-service";
import { RedoRequestService } from "src/lib/redo-request-service";
import { StudentService } from "src/lib/student-service";
import { TestFeedbackService } from "src/lib/test-feedback-service";
import { TestService } from "src/lib/test-service";
import { TestStatusService } from "src/lib/test-status-service";
import { TestSubmissionService } from "src/lib/test-submission-service";

/**
 * Real services constructed against a per-test isolated MongoDB.
 * Returned by setupServerPageTest and exposed to mock factories via getTestServices.
 */
export interface TestServices {
  answerService: AnswerService;
  courseService: CourseService;
  enrollmentService: EnrollmentService;
  gradeService: GradeService;
  pageGuard: PageGuard;
  questionService: QuestionService;
  redoRequestService: RedoRequestService;
  studentService: StudentService;
  testFeedbackService: TestFeedbackService;
  testService: TestService;
  testStatusService: TestStatusService;
  testSubmissionService: TestSubmissionService;
}

interface TestDbHandle {
  client: MongoClient;
  db: Db;
}

let currentDb: TestDbHandle | null = null;
let currentServices: TestServices | null = null;

function makeServices(db: Db): TestServices {
  const questionService = new QuestionService(db);
  const answerService = new AnswerService(db, questionService);
  const testService = new TestService(db);
  const gradeService = new GradeService(
    db,
    questionService,
    answerService,
    testService,
  );
  const testSubmissionService = new TestSubmissionService(db, gradeService);
  const testStatusService = new TestStatusService(
    answerService,
    testSubmissionService,
    gradeService,
  );
  const courseService = new CourseService(db);
  const enrollmentService = new EnrollmentService(db);
  const studentService = new StudentService(db);
  const testFeedbackService = new TestFeedbackService(db);
  const redoRequestService = new RedoRequestService(db);
  const pageGuard = new PageGuard(enrollmentService);

  return {
    answerService,
    courseService,
    enrollmentService,
    gradeService,
    pageGuard,
    questionService,
    redoRequestService,
    studentService,
    testFeedbackService,
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

  currentDb = { client, db };
  currentServices = makeServices(db);

  return { db, services: currentServices };
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
  currentServices = null;
}

/**
 * Accessor used by the `vi.mock("src/lib/services-singleton", ...)` factory.
 * Throws if called outside of an active setupTestDb/teardownTestDb window.
 */
export function getTestServices(): TestServices {
  if (!currentServices) {
    throw new Error(
      "getTestServices called before setupTestDb. Add `beforeEach(setupTestDb)` to your test suite.",
    );
  }
  return currentServices;
}

/**
 * Returns a factory object suitable for `vi.mock("src/lib/services-singleton", servicesSingletonMockFactory)`.
 * Each getter lazily reads from the current test's service container.
 */
export function servicesSingletonMockFactory() {
  return {
    getAnswerService: async () => getTestServices().answerService,
    getCourseService: async () => getTestServices().courseService,
    getEnrollmentService: async () => getTestServices().enrollmentService,
    getGradeService: async () => getTestServices().gradeService,
    getPageGuard: async () => getTestServices().pageGuard,
    getQuestionService: async () => getTestServices().questionService,
    getRedoRequestService: async () => getTestServices().redoRequestService,
    getStudentService: async () => getTestServices().studentService,
    getTestFeedbackService: async () => getTestServices().testFeedbackService,
    getTestService: async () => getTestServices().testService,
    getTestStatusService: async () => getTestServices().testStatusService,
    getTestSubmissionService: async () =>
      getTestServices().testSubmissionService,
  };
}
