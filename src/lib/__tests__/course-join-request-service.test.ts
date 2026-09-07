import {
  CourseJoinRequestService,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import { ensureIndexes } from "src/lib/database";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it, vi } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Course Join Request Service
 * As the school
 * I want at most one pending join request per (course, student)
 * So that a prospective student's repeated self-registration attempts don't
 * flood the admin queue with duplicate rows
 */
describe("Feature: Course Join Request Service", () => {
  describe("Scenario: createRequest is called twice for the same course and student", () => {
    dbIt("should not create a second pending request", async ({ db }) => {
      const service = new CourseJoinRequestService(db);

      // Given a pending request already exists
      const first = await service.createRequest({
        courseId: "course-1",
        studentId: "student-1",
      });

      // When createRequest is called again for the same pair
      const second = await service.createRequest({
        courseId: "course-1",
        studentId: "student-1",
      });

      // Then the second call returns the existing row, not a new one
      expect(second.id).toBe(first.id);

      // And only one pending request exists
      const all = await db
        .collection("course_join_request")
        .find({ courseId: "course-1", studentId: "student-1" })
        .toArray();
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe(JoinRequestStatus.Pending);
    });
  });

  describe("Scenario: two submissions race to create a pending row for the same pair", () => {
    dbIt(
      "should return the existing pending request instead of creating a duplicate when a lost race hits the unique index",
      async ({ db }) => {
        await ensureIndexes(db);
        const service = new CourseJoinRequestService(db);

        // First submission wins normally.
        const winner = await service.createRequest({
          courseId: "course-1",
          studentId: "student-1",
        });

        // Simulate the TOCTOU race F10 describes: this caller's own
        // pre-check ran before the winner's write was visible to it, so it
        // wrongly proceeds to insert — the unique index is the real guard.
        vi.spyOn(service, "getPendingRequest").mockResolvedValueOnce(null);

        const loser = await service.createRequest({
          courseId: "course-1",
          studentId: "student-1",
        });

        // The lost race reads as the existing pending request, not a crash
        expect(loser.id).toBe(winner.id);

        // And still exactly one pending row exists
        const all = await db
          .collection("course_join_request")
          .find({ courseId: "course-1", studentId: "student-1" })
          .toArray();
        expect(all).toHaveLength(1);
      },
    );
  });

  describe("Scenario: a previously-rejected student requests to join again", () => {
    dbIt(
      "should create a new pending request even though a rejected row for the same pair already exists",
      async ({ db }) => {
        await ensureIndexes(db);
        const service = new CourseJoinRequestService(db);

        // Given a resolved (rejected) request already exists for this pair —
        // the index is partial precisely so this row never blocks a re-request.
        await db.collection("course_join_request").insertOne({
          id: crypto.randomUUID(),
          courseId: "course-1",
          studentId: "student-1",
          status: JoinRequestStatus.Rejected,
          requestedAt: new Date(),
          resolvedAt: new Date(),
          resolvedBy: "admin-1",
        });

        const created = await service.createRequest({
          courseId: "course-1",
          studentId: "student-1",
        });

        expect(created.status).toBe(JoinRequestStatus.Pending);

        // The rejected row survives alongside the new pending one
        const all = await db
          .collection("course_join_request")
          .find({ courseId: "course-1", studentId: "student-1" })
          .toArray();
        expect(all).toHaveLength(2);
      },
    );
  });

  describe("Scenario: approving a request that has already been rejected", () => {
    dbIt("should refuse and leave the request Rejected", async ({ db }) => {
      const service = new CourseJoinRequestService(db);

      // Given a request that has already been rejected
      const request = await service.createRequest({
        courseId: "course-1",
        studentId: "student-1",
      });
      await service.reject(request.id, "admin-1");

      // When an admin tries to approve the same request
      await expect(service.approve(request.id, "admin-2")).rejects.toThrow(
        "already been handled",
      );

      // Then it stays Rejected — never both rejected and enrolled
      const after = await service.getRequest(request.id);
      expect(after?.status).toBe(JoinRequestStatus.Rejected);
    });
  });
});
