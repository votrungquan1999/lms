import {
  CourseJoinRequestService,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import { ensureIndexes } from "src/lib/database";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
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
      const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);

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
        const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);

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
        const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);

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

  // "Already handled" no longer means one thing: Rejected always refuses,
  // but Approved is a safe retry (D90) — the two scenarios below pin both.
  describe("Scenario: approving a request that has already been rejected", () => {
    dbIt("should refuse and leave the request Rejected", async ({ db }) => {
      const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);

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

  describe("Scenario: approving a request that has already been approved", () => {
    dbIt(
      "should succeed again instead of throwing (a safe, inert retry)",
      async ({ db }) => {
        const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);

        // Given a request that is already Approved
        const request = await service.createRequest({
          courseId: "course-1",
          studentId: "student-1",
        });
        await service.approve(request.id, "admin-1");

        // When approve() is called again on the same request — e.g. a crash
        // between claiming Approved and enrolling the student (D90)
        await expect(
          service.approve(request.id, "admin-2"),
        ).resolves.toBeUndefined();

        // Then it is still just Approved — no error, no second resolution
        const after = await service.getRequest(request.id);
        expect(after?.status).toBe(JoinRequestStatus.Approved);
      },
    );
  });

  describe("Scenario: another school's service resolves this school's request", () => {
    for (const resolve of ["approve", "reject"] as const) {
      dbIt(
        `${resolve} should refuse and leave the request Pending`,
        async ({ db }) => {
          const owner = new CourseJoinRequestService(db, TEST_SCHOOL_ID);
          const request = await owner.createRequest({
            courseId: "course-1",
            studentId: "student-1",
          });
          const otherSchool = new CourseJoinRequestService(db, "school-b");

          await expect(
            otherSchool[resolve](request.id, "admin-b"),
          ).rejects.toThrow();

          const after = await owner.getRequest(request.id);
          expect(after?.status).toBe(JoinRequestStatus.Pending);
        },
      );
    }
  });

  describe("Scenario: a request names a student or a course that no longer exists", () => {
    dbIt(
      "should list and count only the requests the admin can act on",
      async ({ db }) => {
        const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);
        const now = new Date();

        // Given one live student and course, a course that was removed, a student that was removed, and a course of another school
        await db.collection("student").insertMany([
          { id: "student-live", name: "Live", username: "live" },
          { id: "student-other", name: "Other", username: "other" },
        ]);
        await db.collection("course").insertMany([
          { id: "course-live", title: "Live Course", schoolId: TEST_SCHOOL_ID },
          { id: "course-foreign", title: "Foreign", schoolId: "school-b" },
        ]);
        const request = (id: string, courseId: string, studentId: string) =>
          service
            .createRequest({ courseId, studentId })
            .then((created) =>
              db
                .collection("course_join_request")
                .updateOne(
                  { id: created.id },
                  { $set: { requestedAt: now, id } },
                ),
            );
        await request("r-live", "course-live", "student-live");
        await request("r-no-course", "course-gone", "student-live");
        await request("r-no-student", "course-live", "student-gone");
        await request("r-foreign-course", "course-foreign", "student-other");

        // When the pending requests are listed and counted
        const rows = await service.listVisibleByStatus(
          JoinRequestStatus.Pending,
        );
        const count = await service.countVisiblePending();

        // Then only the live one shows, with its names, and the count agrees
        expect(rows).toEqual([
          {
            id: "r-live",
            studentName: "Live",
            studentUsername: "live",
            courseTitle: "Live Course",
            requestedAt: now,
          },
        ]);
        expect(count).toBe(1);
      },
    );
  });

  describe("Scenario: pending requests are listed for one course", () => {
    dbIt(
      "should keep only that course's requests, oldest first",
      async ({ db }) => {
        const service = new CourseJoinRequestService(db, TEST_SCHOOL_ID);

        // Given two live courses, with two requests for the first (newer one created first) and one for the second
        await db.collection("student").insertMany([
          { id: "s-a", name: "A", username: "a" },
          { id: "s-b", name: "B", username: "b" },
          { id: "s-c", name: "C", username: "c" },
        ]);
        await db.collection("course").insertMany([
          { id: "course-1", title: "One", schoolId: TEST_SCHOOL_ID },
          { id: "course-2", title: "Two", schoolId: TEST_SCHOOL_ID },
        ]);
        const stamp = async (courseId: string, studentId: string, at: Date) => {
          const created = await service.createRequest({ courseId, studentId });
          await db
            .collection("course_join_request")
            .updateOne({ id: created.id }, { $set: { requestedAt: at } });
        };
        await stamp("course-1", "s-b", new Date("2026-09-02T10:00:00Z"));
        await stamp("course-1", "s-a", new Date("2026-09-01T10:00:00Z"));
        await stamp("course-2", "s-c", new Date("2026-09-01T09:00:00Z"));

        // When one course's pending requests are listed
        const rows = await service.listVisibleByStatus(
          JoinRequestStatus.Pending,
          { courseId: "course-1" },
        );

        // Then only its two show, the older first
        expect(rows.map((r) => r.studentName)).toEqual(["A", "B"]);
      },
    );
  });
});
