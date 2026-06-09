import { StudentService } from "src/lib/student-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

/**
 * Feature: Student Service — batch username existence lookup
 * Supports the bulk-import preview ("already-exists") and confirm re-validation.
 */

const dbIt = withTestDb(it);

describe("Feature: StudentService.findExistingUsernames", () => {
  dbIt(
    "returns only the usernames that already exist in the collection",
    async ({ db }) => {
      // Given two existing students
      const service = new StudentService(db);
      await service.createStudentDocument({
        authUserId: "auth-1",
        username: "alice",
        name: "Alice",
        createdBy: "admin",
      });
      await service.createStudentDocument({
        authUserId: "auth-2",
        username: "bob",
        name: "Bob",
        createdBy: "admin",
      });

      // When checking a mix of existing and new usernames
      const existing = await service.findExistingUsernames([
        "alice",
        "charlie",
        "bob",
      ]);

      // Then only the existing ones come back (order-independent)
      expect(existing.sort()).toEqual(["alice", "bob"]);
    },
  );

  dbIt(
    "returns an empty array when none of the usernames exist",
    async ({ db }) => {
      // Given an existing student
      const service = new StudentService(db);
      await service.createStudentDocument({
        authUserId: "auth-1",
        username: "alice",
        name: "Alice",
        createdBy: "admin",
      });

      // When checking a non-empty list of all-new usernames
      const existing = await service.findExistingUsernames(["charlie", "dave"]);

      // Then nothing comes back
      expect(existing).toEqual([]);
    },
  );

  dbIt("returns an empty array for empty input", async ({ db }) => {
    // Given a student exists
    const service = new StudentService(db);
    await service.createStudentDocument({
      authUserId: "auth-1",
      username: "alice",
      name: "Alice",
      createdBy: "admin",
    });

    // When checking an empty list
    const existing = await service.findExistingUsernames([]);

    // Then nothing comes back
    expect(existing).toEqual([]);
  });
});
