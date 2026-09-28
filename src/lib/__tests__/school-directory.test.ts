import { CourseService } from "src/lib/course-service";
import { SchoolDirectory } from "src/lib/school-directory";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: a join-link lookup never matches a course with no active link
 * As the school
 * I want an empty, null, or undefined token to never resolve to a course
 * So that the public join page can never be used to enumerate courses via
 * the Mongo driver's undefined -> null serialization (D41)
 */
describe("Feature: a join-link lookup never matches a course with no active link", () => {
  dbIt(
    "returns null for an empty, null, or undefined token even though a course has a null invite token",
    async ({ db }) => {
      // Given a course with no active join link (createCourse defaults
      // inviteToken to null — D41's exact danger case) and a second course
      // with a live token, so an operator object like { $ne: null } has a
      // real course to leak if the query-level guard is missing
      const courseService = new CourseService(db, TEST_SCHOOL_ID);
      await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });
      const liveCourse = await courseService.createCourse({
        title: "Live-Link Course",
        description: "",
        createdBy: "admin-1",
      });
      await courseService.getOrCreateInviteToken(liveCourse.id);
      const schoolDirectory = new SchoolDirectory(db);

      // When looking it up with the values a missing/renamed form field
      // yields (formData.get returns null; a bare `never` cast models that
      // for the empty/undefined cases TypeScript would otherwise reject)
      // Then none of them resolve to the null-token course
      expect(await schoolDirectory.findCourseByInviteToken("")).toBeNull();
      expect(
        await schoolDirectory.findCourseByInviteToken(null as never),
      ).toBeNull();
      expect(
        await schoolDirectory.findCourseByInviteToken(undefined as never),
      ).toBeNull();

      // Truthy, so the falsy short-circuit lets it past — only the $eq/$type
      // filter stops an operator object from matching the live-token course.
      expect(
        await schoolDirectory.findCourseByInviteToken({ $ne: null } as never),
      ).toBeNull();
    },
  );
});

/**
 * Feature: an invite link names its course's school, whichever school it is
 * As a visitor opening an invite link with no session
 * I want the link to resolve to its course and that course's school
 * So that I join the right school even though no one is signed in
 */
describe("Feature: an invite link names its course's school, whichever school it is", () => {
  dbIt(
    "resolves each school's invite token to its own course and school",
    async ({ db }) => {
      const defaultSchoolCourses = new CourseService(db, TEST_SCHOOL_ID);
      const otherSchoolCourses = new CourseService(db, "school-b");
      const defaultCourse = await defaultSchoolCourses.createCourse({
        title: "Default School Course",
        description: "",
        createdBy: "admin-a",
      });
      const otherCourse = await otherSchoolCourses.createCourse({
        title: "School B Course",
        description: "",
        createdBy: "admin-b",
      });
      const defaultToken = await defaultSchoolCourses.getOrCreateInviteToken(
        defaultCourse.id,
      );
      const otherToken = await otherSchoolCourses.getOrCreateInviteToken(
        otherCourse.id,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const defaultInvite =
        await schoolDirectory.findCourseByInviteToken(defaultToken);
      const otherInvite =
        await schoolDirectory.findCourseByInviteToken(otherToken);

      expect(defaultInvite).toMatchObject({
        course: { id: defaultCourse.id },
        schoolId: TEST_SCHOOL_ID,
      });
      expect(otherInvite).toMatchObject({
        course: { id: otherCourse.id },
        schoolId: "school-b",
      });
    },
  );
});
