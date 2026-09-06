import {
  CourseJoinRequestService,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

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
});
