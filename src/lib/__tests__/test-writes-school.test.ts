import type { Db } from "mongodb";
import type { TestDocument } from "src/lib/test-service";
import {
  addTestSchool,
  getTestServices,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Seeds a course in the default school — another school's course from
 * School B's point of view.
 */
async function seedForeignCourseId(): Promise<string> {
  const course = await getTestServices().courseService.createCourse({
    title: "Foreign Course",
    description: "",
    createdBy: "default-school-admin",
  });
  return course.id;
}

/**
 * Seeds a test in the default school — another school's test from School B's
 * point of view.
 */
async function seedForeignTestId(): Promise<string> {
  const courseId = await seedForeignCourseId();
  const test = await getTestServices().testService.createTest(courseId, {
    title: "Foreign Test",
    description: "",
    createdBy: "default-school-admin",
  });
  return test.id;
}

/**
 * Feature: a school's tests are created and changed only within that school
 * As a school admin working in one school
 * I want the test service itself to refuse another school's course or test
 * So that no write path, even one that skips the page's own check, puts a test in or changes one of another school's
 */
describe("Feature: a school's tests are created and changed only within that school", () => {
  let db: Db;
  let schoolBId: string;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
    schoolBId = (await addTestSchool("School B")).id;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("refuses to create a test under another school's course, and writes nothing", async () => {
    const courseId = await seedForeignCourseId();

    await expect(
      getTestServices(schoolBId).testService.createTest(courseId, {
        title: "Injected",
        description: "",
        createdBy: "school-b-admin",
      }),
    ).rejects.toThrow("Course not found");

    const written = await db
      .collection<TestDocument>("test")
      .countDocuments({ courseId });
    expect(written).toBe(0);
  });

  it("refuses to change another school's test settings, and leaves them unchanged", async () => {
    const testId = await seedForeignTestId();

    await expect(
      getTestServices(schoolBId).testService.updateTestSettings(testId, {
        showGradeAfterSubmit: false,
        showCorrectAnswerAfterSubmit: false,
        timeLimitMinutes: 5,
        isPractice: false,
        answerRevealMode: "diff",
        updatedBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");

    const stored = await db
      .collection<TestDocument>("test")
      .findOne({ id: testId });
    expect(stored?.timeLimitMinutes).toBeNull();
    expect(stored?.updatedBy).toBeNull();
  });

  it("refuses to release grades on another school's test, and leaves them unreleased", async () => {
    const testId = await seedForeignTestId();

    await expect(
      getTestServices(schoolBId).testService.releaseGrades(
        testId,
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const stored = await db
      .collection<TestDocument>("test")
      .findOne({ id: testId });
    expect(stored?.gradesReleasedAt).toBeNull();
  });

  it("refuses to release correct answers on another school's test, and leaves them unreleased", async () => {
    const testId = await seedForeignTestId();

    await expect(
      getTestServices(schoolBId).testService.releaseCorrectAnswers(
        testId,
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const stored = await db
      .collection<TestDocument>("test")
      .findOne({ id: testId });
    expect(stored?.correctAnswersReleasedAt).toBeNull();
  });

  it("refuses to delete another school's test, and leaves it live", async () => {
    const testId = await seedForeignTestId();

    await expect(
      getTestServices(schoolBId).testService.deleteTest(
        testId,
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const stored = await db
      .collection<TestDocument>("test")
      .findOne({ id: testId });
    expect(stored?.deletedAt).toBeNull();
  });
});
