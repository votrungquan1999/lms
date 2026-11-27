import { TestFeedbackService } from "src/lib/test-feedback-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawTest } from "src/tests/insert-raw-test";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("TestFeedbackService", () => {
  dbIt(
    "should remove the feedback when it is saved empty, and keep one row when it is saved again",
    async ({ db }) => {
      await insertRawTest(db, "test-1");
      const { testService } = buildCoreServices(db);
      const testFeedbackService = new TestFeedbackService(db, testService);
      const save = (feedback: string) =>
        testFeedbackService.setTestFeedback({
          testId: "test-1",
          studentId: "student-1",
          feedback,
          gradedBy: "admin-1",
        });

      // Given: saved feedback, then a changed one
      await save("Good work");
      await save("Better work");
      expect(
        await testFeedbackService.getTestFeedback("test-1", "student-1"),
      ).toBe("Better work");
      expect(await db.collection("test_feedback").countDocuments()).toBe(1);

      // When: the teacher saves it empty
      await save("");

      // Then: nothing is stored for the student
      expect(
        await testFeedbackService.getTestFeedback("test-1", "student-1"),
      ).toBeNull();
      expect(await db.collection("test_feedback").countDocuments()).toBe(0);
    },
  );
});
