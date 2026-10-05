import type { Db } from "mongodb";
import type { PoolQuestionDocument } from "src/lib/pool-question-service";
import type { QuestionDocument } from "src/lib/question-service";
import {
  addTestSchool,
  getTestServices,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** The default school's ids every row below aims another school's writes at. */
interface ForeignTest {
  courseId: string;
  testId: string;
}

/**
 * Seeds a course and a test in the default school — the other school's
 * records from School B's point of view.
 */
async function seedForeignTest(): Promise<ForeignTest> {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Foreign Course",
    description: "",
    createdBy: "default-school-admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Foreign Test",
    description: "",
    createdBy: "default-school-admin",
  });
  return { courseId: course.id, testId: test.id };
}

/**
 * Feature: a school's question writes only ever land on that school's tests and pools
 * As a school admin working in one school
 * I want the question services themselves to refuse a test or pool outside my school
 * So that no write path, even one that skips the page's own check, edits another school's questions
 */
describe("Feature: a school's question writes only ever land on that school's tests and pools", () => {
  let db: Db;
  let schoolBId: string;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
    schoolBId = (await addTestSchool("School B")).id;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("refuses to add a question to another school's test, and writes nothing", async () => {
    const { testId } = await seedForeignTest();

    await expect(
      getTestServices(schoolBId).questionService.addQuestion(testId, {
        title: "Injected",
        content: "",
        createdBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");

    const written = await db
      .collection<QuestionDocument>("question")
      .countDocuments({ testId });
    expect(written).toBe(0);
  });

  it("refuses to import questions into another school's test, and writes nothing", async () => {
    const { testId } = await seedForeignTest();

    await expect(
      getTestServices(schoolBId).questionService.importQuestions(
        testId,
        [{ title: "Injected", content: "" }],
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const written = await db
      .collection<QuestionDocument>("question")
      .countDocuments({ testId });
    expect(written).toBe(0);
  });

  it("refuses to compose pool questions into another school's test, and writes nothing", async () => {
    const { testId } = await seedForeignTest();

    await expect(
      getTestServices(schoolBId).questionService.composeFromPools(
        testId,
        [
          {
            questions: [
              {
                title: "Injected",
                content: "",
                type: "free_text",
                options: null,
                weight: 1,
                mcGradingStrategy: null,
                explanation: null,
                referenceAnswer: null,
                answerRevealMode: null,
                media: [],
              },
            ],
            count: 1,
          },
        ],
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const written = await db
      .collection<QuestionDocument>("question")
      .countDocuments({ testId });
    expect(written).toBe(0);
  });

  it("refuses to edit a question on another school's test, and leaves it unchanged", async () => {
    const { testId } = await seedForeignTest();
    const question = await getTestServices().questionService.addQuestion(
      testId,
      { title: "Original", content: "", createdBy: "default-school-admin" },
    );

    await expect(
      getTestServices(schoolBId).questionService.updateQuestion(
        testId,
        question.id,
        { title: "Hijacked" },
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const stored = await db
      .collection<QuestionDocument>("question")
      .findOne({ id: question.id });
    expect(stored?.title).toBe("Original");
  });

  it("refuses to edit a question through a test it doesn't belong to, and leaves it unchanged", async () => {
    const { courseId, testId: otherTestId } = await seedForeignTest();
    const services = getTestServices();
    const ownTest = await services.testService.createTest(courseId, {
      title: "Own Test",
      description: "",
      createdBy: "default-school-admin",
    });
    const question = await services.questionService.addQuestion(otherTestId, {
      title: "Original",
      content: "",
      createdBy: "default-school-admin",
    });

    await expect(
      services.questionService.updateQuestion(
        ownTest.id,
        question.id,
        { title: "Edited through the wrong test" },
        "default-school-admin",
      ),
    ).rejects.toThrow("Question not found");

    const stored = await db
      .collection<QuestionDocument>("question")
      .findOne({ id: question.id });
    expect(stored?.title).toBe("Original");
  });

  it("refuses to delete a question on another school's test, and leaves it live", async () => {
    const { testId } = await seedForeignTest();
    const question = await getTestServices().questionService.addQuestion(
      testId,
      { title: "Original", content: "", createdBy: "default-school-admin" },
    );

    await expect(
      getTestServices(schoolBId).questionService.deleteQuestion(
        testId,
        question.id,
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const stored = await db
      .collection<QuestionDocument>("question")
      .findOne({ id: question.id });
    expect(stored?.deletedAt).toBeNull();
  });

  it("refuses to delete a question through a test it doesn't belong to, and leaves it live", async () => {
    const { courseId, testId: otherTestId } = await seedForeignTest();
    const services = getTestServices();
    const ownTest = await services.testService.createTest(courseId, {
      title: "Own Test",
      description: "",
      createdBy: "default-school-admin",
    });
    const question = await services.questionService.addQuestion(otherTestId, {
      title: "Original",
      content: "",
      createdBy: "default-school-admin",
    });

    await expect(
      services.questionService.deleteQuestion(
        ownTest.id,
        question.id,
        "default-school-admin",
      ),
    ).rejects.toThrow("Question not found");

    const stored = await db
      .collection<QuestionDocument>("question")
      .findOne({ id: question.id });
    expect(stored?.deletedAt).toBeNull();
  });

  it("refuses to add a question to another school's pool, and writes nothing", async () => {
    const pool = await getTestServices().questionPoolService.createPool({
      name: "Foreign Pool",
      description: "",
      createdBy: "default-school-admin",
    });

    await expect(
      getTestServices(schoolBId).poolQuestionService.addPoolQuestion(pool.id, {
        title: "Injected",
        content: "",
        createdBy: "school-b-admin",
      }),
    ).rejects.toThrow("Pool not found");

    const written = await db
      .collection<PoolQuestionDocument>("pool_question")
      .countDocuments({ poolId: pool.id });
    expect(written).toBe(0);
  });
});
