/** biome-ignore-all lint/style/noNonNullAssertion: this is test */
import { CourseService } from "src/lib/course-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("TestService", () => {
  dbIt(
    "should create a test with default visibility settings",
    async ({ db }) => {
      const courseService = new CourseService(db);
      const testService = new TestService(db);

      const course = await courseService.createCourse({
        title: "Course",
        description: "Desc",
        createdBy: "admin",
      });

      const test = await testService.createTest(course.id, {
        title: "Test 1",
        description: "Test description",
        createdBy: "admin",
      });

      expect(test.showCorrectAnswerAfterSubmit).toBe(true);
      expect(test.showGradeAfterSubmit).toBe(true);
      expect(test.correctAnswersReleasedAt).toBeNull();
      expect(test.gradesReleasedAt).toBeNull();
    },
  );

  dbIt(
    "should create a test with custom visibility settings",
    async ({ db }) => {
      const courseService = new CourseService(db);
      const testService = new TestService(db);

      const course = await courseService.createCourse({
        title: "Course",
        description: "Desc",
        createdBy: "admin",
      });

      const test = await testService.createTest(course.id, {
        title: "Test 2",
        description: "Test description",
        createdBy: "admin",
        showCorrectAnswerAfterSubmit: false,
        showGradeAfterSubmit: false,
      });

      expect(test.showCorrectAnswerAfterSubmit).toBe(false);
      expect(test.showGradeAfterSubmit).toBe(false);
    },
  );

  dbIt(
    "should add questions then release grades and correct answers",
    async ({ db }) => {
      const courseService = new CourseService(db);
      const testService = new TestService(db);
      const questionService = new QuestionService(db);

      const course = await courseService.createCourse({
        title: "Course",
        description: "Desc",
        createdBy: "admin",
      });

      const test = await testService.createTest(course.id, {
        title: "Test 3",
        description: "",
        createdBy: "admin",
      });

      await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Content",
        createdBy: "admin",
        type: "free_text",
      });

      // Initially not released
      const before = await testService.getTest(test.id);
      expect(before?.gradesReleasedAt).toBeNull();

      await testService.releaseGrades(test.id, "admin");
      await testService.releaseCorrectAnswers(test.id, "admin");

      const after = await testService.getTest(test.id);
      expect(after).not.toBeNull();
      expect(after?.gradesReleasedAt).toBeInstanceOf(Date);
      expect(after?.correctAnswersReleasedAt).toBeInstanceOf(Date);
    },
  );

  dbIt("should soft delete a test and hide it from queries", async ({ db }) => {
    const courseService = new CourseService(db);
    const testService = new TestService(db);

    const course = await courseService.createCourse({
      title: "Course",
      description: "Desc",
      createdBy: "admin",
    });

    const test = await testService.createTest(course.id, {
      title: "Test to delete",
      description: "Desc",
      createdBy: "admin",
    });

    // Verify it exists in list
    let list = await testService.listTests(course.id);
    expect(list).toHaveLength(1);

    // Soft delete it
    await testService.deleteTest(test.id, "admin");

    // Verify it's hidden from list
    list = await testService.listTests(course.id);
    expect(list).toHaveLength(0);

    // Verify it's hidden from getTest
    const fetched = await testService.getTest(test.id);
    expect(fetched).toBeNull();

    // Verify the document is still in the DB with deletedAt/deletedBy fields
    const doc = await db.collection("test").findOne({ id: test.id });
    expect(doc).not.toBeNull();
    expect(doc?.deletedAt).toBeInstanceOf(Date);
    expect(doc?.deletedBy).toBe("admin");
  });
});
