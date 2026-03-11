import { AnswerService } from "./answer-service";
import { CourseService } from "./course-service";
import { getDatabase } from "./database";
import { EnrollmentService } from "./enrollment-service";
import { PageGuard } from "./page-guard";
import { QuestionService } from "./question-service";
import { StudentService } from "./student-service";
import { TestService } from "./test-service";

/**
 * Lazy singletons for domain services.
 * Uses the shared database connection from database.ts.
 */

let answerService: AnswerService | null = null;
let courseService: CourseService | null = null;
let enrollmentService: EnrollmentService | null = null;
let testService: TestService | null = null;
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
    answerService = new AnswerService(db);
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

export async function getTestService(): Promise<TestService> {
  if (!testService) {
    const db = await getDatabase();
    testService = new TestService(db);
  }
  return testService;
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
