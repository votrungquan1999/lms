import type { Collection } from "mongodb";
import { ensureIndexes } from "src/lib/database";
import {
  type EnrollmentDocument,
  EnrollmentService,
} from "src/lib/enrollment-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it, vi } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Enroll Student
 * As the system
 * I want re-enrolling an already-enrolled student to succeed
 * So that a retried enrollment (e.g. after an interrupted approval) is safe to repeat
 */

describe("Feature: Enroll Student", () => {
  describe("Scenario: enrolling a student who is already enrolled", () => {
    dbIt(
      "should succeed without creating a duplicate enrollment record",
      async ({ db }) => {
        // Given — the student is already enrolled
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");

        // When — enrolling the same student in the same course again
        await service.enrollStudent("course-1", "student-a", "admin-2");

        // Then — no duplicate row; only the original enrollment remains
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toEqual(["student-a"]);

        // And that row is untouched by the second call's different
        // createdBy — the no-op path must not update it.
        const rows = await db
          .collection("enrollment")
          .find({ courseId: "course-1", studentId: "student-a" })
          .toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].createdBy).toBe("admin-1");
      },
    );
  });

  describe("Scenario: two enrollments race to insert the same (courseId, studentId) pair", () => {
    dbIt(
      "should not create a duplicate enrollment when a lost race hits the unique index",
      async ({ db }) => {
        await ensureIndexes(db);
        const service = new EnrollmentService(db);

        // First call wins normally.
        await service.enrollStudent("course-1", "student-a", "admin-1");

        // Simulate the TOCTOU race enrollStudent has: this caller's own
        // findOne ran before the winner's insert was visible to it, so it
        // wrongly proceeds to insert — the unique index is the real guard
        // (mirrors the join-request race test in
        // course-join-request-service.test.ts).
        const collection = (
          service as unknown as { enrollments: Collection<EnrollmentDocument> }
        ).enrollments;
        vi.spyOn(collection, "findOne").mockResolvedValueOnce(null);

        await service.enrollStudent("course-1", "student-a", "admin-2");

        // The lost race resolves quietly instead of crashing, and still
        // exactly one enrollment row exists
        const rows = await db
          .collection("enrollment")
          .find({ courseId: "course-1", studentId: "student-a" })
          .toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].createdBy).toBe("admin-1");
      },
    );
  });
});
