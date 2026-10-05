import type { Db } from "mongodb";
import { CourseService } from "src/lib/course-service";
import { TestService } from "src/lib/test-service";
import { TEST_SCHOOL_ID } from "./create-test-db";

/**
 * Builds one school's `TestService` the way the app wires it, for suites that
 * construct services directly instead of through the harness.
 * @param db - The test's isolated database.
 * @param schoolId - The school; the default test school when omitted.
 */
export function buildTestService(
  db: Db,
  schoolId: string = TEST_SCHOOL_ID,
): TestService {
  return new TestService(db, schoolId, new CourseService(db, schoolId));
}
