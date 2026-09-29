import type { Db } from "mongodb";
import type { TestDocument } from "src/lib/test-service";
import { TEST_SCHOOL_ID } from "./create-test-db";

/**
 * Raw-inserts a minimal test document with a literal id in the default test
 * school, for suites that drive answers or submissions against ids they never
 * created through `TestService` — the services refuse a test they can't find.
 * @param db - The test's isolated database.
 * @param id - The literal test id the suite submits against.
 */
export async function insertRawTest(db: Db, id: string): Promise<void> {
  await db.collection<TestDocument>("test").insertOne({
    id,
    courseId: "course-1",
    title: "Test",
    description: "",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
    answerRevealMode: "plain",
    timeLimitMinutes: null,
    isPractice: false,
    correctAnswersReleasedAt: null,
    gradesReleasedAt: null,
    createdAt: new Date(),
    createdBy: "admin",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    schoolId: TEST_SCHOOL_ID,
  });
}
