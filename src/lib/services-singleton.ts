import { AnswerService } from "./answer-service";
import { CourseService } from "./course-service";
import { getDatabase } from "./database";
import { EnrollmentService } from "./enrollment-service";
import { GradeService } from "./grade-service";
import { PageGuard } from "./page-guard";
import { QuestionService } from "./question-service";
import { RedoRequestService } from "./redo-request-service";
import { StudentService } from "./student-service";
import { TestFeedbackService } from "./test-feedback-service";
import { TestService } from "./test-service";
import { TestStatusService } from "./test-status-service";
import { TestSubmissionService } from "./test-submission-service";

/**
 * Lazy singletons for domain services.
 * Uses the shared database connection from database.ts.
 */

let answerService: AnswerService | null = null;
let courseService: CourseService | null = null;
let enrollmentService: EnrollmentService | null = null;
let gradeService: GradeService | null = null;
let redoRequestService: RedoRequestService | null = null;
let testService: TestService | null = null;
let testFeedbackService: TestFeedbackService | null = null;
let testStatusService: TestStatusService | null = null;
let testSubmissionService: TestSubmissionService | null = null;
let questionService: QuestionService | null = null;
let studentService: StudentService | null = null;
let pageGuard: PageGuard | null = null;

export async function getPageGuard(): Promise<PageGuard> {
  if (!pageGuard) {
    const enrollment = await getEnrollmentService();
    pageGuard = new PageGuard(enrollment);
  }
  return pageGuard;
}

export async function getAnswerService(): Promise<AnswerService> {
  if (!answerService) {
    const db = await getDatabase();
    const qs = await getQuestionService();
    answerService = new AnswerService(db, qs);
  }
  return answerService;
}

export async function getCourseService(): Promise<CourseService> {
  if (!courseService) {
    const db = await getDatabase();
    courseService = new CourseService(db);
  }
  return courseService;
}

export async function getEnrollmentService(): Promise<EnrollmentService> {
  if (!enrollmentService) {
    const db = await getDatabase();
    enrollmentService = new EnrollmentService(db);
  }
  return enrollmentService;
}

export async function getGradeService(): Promise<GradeService> {
  if (!gradeService) {
    const db = await getDatabase();
    const questionService = await getQuestionService();
    const answerService = await getAnswerService();
    const testService = await getTestService();
    gradeService = new GradeService(
      db,
      questionService,
      answerService,
      testService,
    );
  }
  return gradeService;
}

export async function getTestService(): Promise<TestService> {
  if (!testService) {
    const db = await getDatabase();
    testService = new TestService(db);
  }
  return testService;
}

export async function getTestFeedbackService(): Promise<TestFeedbackService> {
  if (!testFeedbackService) {
    const db = await getDatabase();
    testFeedbackService = new TestFeedbackService(db);
  }
  return testFeedbackService;
}

export async function getTestSubmissionService(): Promise<TestSubmissionService> {
  if (!testSubmissionService) {
    const db = await getDatabase();
    testSubmissionService = new TestSubmissionService(
      db,
      await getGradeService(),
    );
  }
  return testSubmissionService;
}

export async function getTestStatusService(): Promise<TestStatusService> {
  if (!testStatusService) {
    const answers = await getAnswerService();
    const submissions = await getTestSubmissionService();
    const grades = await getGradeService();
    testStatusService = new TestStatusService(answers, submissions, grades);
  }
  return testStatusService;
}

export async function getQuestionService(): Promise<QuestionService> {
  if (!questionService) {
    const db = await getDatabase();
    questionService = new QuestionService(db);
  }
  return questionService;
}

export async function getStudentService(): Promise<StudentService> {
  if (!studentService) {
    const db = await getDatabase();
    studentService = new StudentService(db);
  }
  return studentService;
}

export async function getRedoRequestService(): Promise<RedoRequestService> {
  if (!redoRequestService) {
    const db = await getDatabase();
    redoRequestService = new RedoRequestService(db);
  }
  return redoRequestService;
}
