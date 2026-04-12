/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import { RedoRequestService } from "src/lib/redo-request-service";
import { withTestDb } from "src/tests/create-test-db";
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
        const service = new RedoRequestService(db);

        // Given no active request exists
        const before = await service.getActiveRedoRequest("test-1", "student-1");
        expect(before).toBeNull();

        // When the admin requests a redo
        await service.requestRedo("test-1", "student-1", "admin-1");

        // Then getActiveRedoRequest returns the active request
        const active = await service.getActiveRedoRequest("test-1", "student-1");
        expect(active).not.toBeNull();
        expect(active!.testId).toBe("test-1");
        expect(active!.studentId).toBe("student-1");
        expect(active!.requestedBy).toBe("admin-1");
        expect(active!.resolvedAt).toBeNull();
      },
    );

    dbIt(
      "should not return a request for a different student or test",
      async ({ db }) => {
        const service = new RedoRequestService(db);

        await service.requestRedo("test-1", "student-1", "admin-1");

        // Different student: no active request
        expect(await service.getActiveRedoRequest("test-1", "student-2")).toBeNull();

        // Different test: no active request
        expect(await service.getActiveRedoRequest("test-2", "student-1")).toBeNull();
      },
    );
  });

  describe("Step 6: resolveRedoRequest — marks the request as resolved", () => {
    dbIt(
      "should set resolvedAt so getActiveRedoRequest returns null afterwards",
      async ({ db }) => {
        const service = new RedoRequestService(db);

        // Setup: create an active request
        await service.requestRedo("test-1", "student-1", "admin-1");
        expect(await service.getActiveRedoRequest("test-1", "student-1")).not.toBeNull();

        // When the redo is resolved (student resubmits)
        await service.resolveRedoRequest("test-1", "student-1");

        // Then the request is no longer active
        const after = await service.getActiveRedoRequest("test-1", "student-1");
        expect(after).toBeNull();
      },
    );

    dbIt(
      "resolveRedoRequest should be a no-op when there is no active request",
      async ({ db }) => {
        const service = new RedoRequestService(db);

        // Should not throw even when no request exists
        await expect(
          service.resolveRedoRequest("test-1", "student-1"),
        ).resolves.not.toThrow();
      },
    );
  });
});
