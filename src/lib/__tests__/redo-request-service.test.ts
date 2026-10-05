/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import { RedoRequestService } from "src/lib/redo-request-service";
import { buildTestService } from "src/tests/build-test-service";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawTest } from "src/tests/insert-raw-test";
import { insertRawCourses } from "src/tests/raw-enrollment-seeds";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Redo Request Service
 * As an admin
 * I want to request a student to redo a test
 * So that the student is prompted to resubmit their answers
 */

describe("RedoRequestService", () => {
  describe("Step 5: requestRedo — creates and retrieves an active redo request", () => {
    dbIt(
      "should create an active redo request that getActiveRedoRequest returns",
      async ({ db }) => {
        await insertRawCourses(db, ["course-1"]);
        const testService = buildTestService(db);
        const service = new RedoRequestService(db, testService);
        const test = await testService.createTest("course-1", {
          title: "Test",
          description: "d",
          createdBy: "admin-1",
        });

        // Given no active request exists
        const before = await service.getActiveRedoRequest(test.id, "student-1");
        expect(before).toBeNull();

        // When the admin requests a redo
        await service.requestRedo(test.id, "student-1", "admin-1");

        // Then getActiveRedoRequest returns the active request
        const active = await service.getActiveRedoRequest(test.id, "student-1");
        expect(active).not.toBeNull();
        expect(active!.testId).toBe(test.id);
        expect(active!.studentId).toBe("student-1");
        expect(active!.requestedBy).toBe("admin-1");
        expect(active!.resolvedAt).toBeNull();
      },
    );

    dbIt(
      "should not return a request for a different student or test",
      async ({ db }) => {
        await insertRawCourses(db, ["course-1"]);
        const testService = buildTestService(db);
        const service = new RedoRequestService(db, testService);
        const testA = await testService.createTest("course-1", {
          title: "Test A",
          description: "d",
          createdBy: "admin-1",
        });
        const testB = await testService.createTest("course-1", {
          title: "Test B",
          description: "d",
          createdBy: "admin-1",
        });

        await service.requestRedo(testA.id, "student-1", "admin-1");

        // Different student: no active request
        expect(
          await service.getActiveRedoRequest(testA.id, "student-2"),
        ).toBeNull();

        // Different test: no active request
        expect(
          await service.getActiveRedoRequest(testB.id, "student-1"),
        ).toBeNull();
      },
    );

    dbIt(
      "should reject requestRedo for a missing test, creating no redo_request doc",
      async ({ db }) => {
        const testService = buildTestService(db);
        const service = new RedoRequestService(db, testService);

        await expect(
          service.requestRedo("no-such-test", "student-1", "admin-1"),
        ).rejects.toThrow("Test not found");
        expect(
          await service.getActiveRedoRequest("no-such-test", "student-1"),
        ).toBeNull();
      },
    );
  });

  describe("Step 6: resolveRedoRequest — marks the request as resolved", () => {
    dbIt(
      "should set resolvedAt so getActiveRedoRequest returns null afterwards",
      async ({ db }) => {
        await insertRawCourses(db, ["course-1"]);
        const testService = buildTestService(db);
        const service = new RedoRequestService(db, testService);
        const test = await testService.createTest("course-1", {
          title: "Test",
          description: "d",
          createdBy: "admin-1",
        });

        // Setup: create an active request
        await service.requestRedo(test.id, "student-1", "admin-1");
        expect(
          await service.getActiveRedoRequest(test.id, "student-1"),
        ).not.toBeNull();

        // When the redo is resolved (student resubmits)
        await service.resolveRedoRequest(test.id, "student-1");

        // Then the request is no longer active
        const after = await service.getActiveRedoRequest(test.id, "student-1");
        expect(after).toBeNull();
      },
    );

    dbIt(
      "resolveRedoRequest should be a no-op when there is no active request",
      async ({ db }) => {
        await insertRawTest(db, "test-1");
        const service = new RedoRequestService(db, buildTestService(db));

        // Should not throw even when no request exists
        await expect(
          service.resolveRedoRequest("test-1", "student-1"),
        ).resolves.not.toThrow();
      },
    );
  });

  describe("Step 18: requestRedo rejects a practice test (R11)", () => {
    dbIt(
      "should reject requestRedo for a practice test, creating no redo_request doc, while still allowing it for a non-practice test",
      async ({ db }) => {
        await insertRawCourses(db, ["course-1"]);
        const testService = buildTestService(db);
        const service = new RedoRequestService(db, testService);

        const practiceTest = await testService.createTest("course-1", {
          title: "Practice Test",
          description: "d",
          createdBy: "admin-1",
          isPractice: true,
        });
        const normalTest = await testService.createTest("course-1", {
          title: "Normal Test",
          description: "d",
          createdBy: "admin-1",
        });

        // Practice test: rejected, and no redo_request document is created
        await expect(
          service.requestRedo(practiceTest.id, "student-1", "admin-1"),
        ).rejects.toThrow("Cannot request a redo on a practice test");
        expect(
          await service.getActiveRedoRequest(practiceTest.id, "student-1"),
        ).toBeNull();

        // Non-practice test: still allowed
        await service.requestRedo(normalTest.id, "student-1", "admin-1");
        expect(
          await service.getActiveRedoRequest(normalTest.id, "student-1"),
        ).not.toBeNull();
      },
    );
  });
});
