import type { Db } from "mongodb";
import { ResultsReportAssembler } from "src/lib/results-report-assembler";
import { StudentService } from "src/lib/student-service";
import { TestFeedbackService } from "src/lib/test-feedback-service";
import { TestStatusService } from "src/lib/test-status-service";
import { buildCoreServices } from "src/tests/build-core-services";

/**
 * Wires the assembler against an isolated test DB, constructing the services
 * not provided by `buildCoreServices` directly (the established pattern).
 * @param db - The isolated test database.
 */
export function makeAssembler(db: Db) {
  const core = buildCoreServices(db);
  const studentService = new StudentService(db);
  const testFeedbackService = new TestFeedbackService(db);
  const testStatusService = new TestStatusService(
    core.answerService,
    core.testSubmissionService,
    core.gradeService,
  );
  const assembler = new ResultsReportAssembler(
    studentService,
    core.testService,
    core.questionService,
    core.answerService,
    core.gradeService,
    testStatusService,
    testFeedbackService,
  );
  return { ...core, studentService, testFeedbackService, assembler };
}

/**
 * Seeds a student named "Alice" and returns the created student.
 * @param studentService - The student service bound to the test DB.
 */
export function createAlice(studentService: StudentService) {
  return studentService.createStudentDocument({
    authUserId: "auth-alice",
    username: "alice",
    name: "Alice",
    createdBy: "admin-1",
  });
}
