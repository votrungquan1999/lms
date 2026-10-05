import { CourseService } from "src/lib/course-service";
import { SchoolDirectory } from "src/lib/school-directory";
import { StudentService } from "src/lib/student-service";
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

/**
 * Feature: a username resolves to its student, whichever school they are in
 * As a student signing in with no school named
 * I want my username to find my profile in my own school
 * So that sign-in and registration checks see every school's usernames
 */
describe("Feature: a username resolves to its student, whichever school they are in", () => {
  dbIt("finds a student of either school by username", async ({ db }) => {
    await new StudentService(db, TEST_SCHOOL_ID).createStudentDocument({
      authUserId: "auth-a",
      username: "ada",
      name: "Ada",
      createdBy: "admin-a",
    });
    await new StudentService(db, "school-b").createStudentDocument({
      authUserId: "auth-b",
      username: "bea",
      name: "Bea",
      createdBy: "admin-b",
    });
    const schoolDirectory = new SchoolDirectory(db);

    expect(await schoolDirectory.findByUsername("ada")).toMatchObject({
      name: "Ada",
      schoolId: TEST_SCHOOL_ID,
    });
    expect(await schoolDirectory.findByUsername("bea")).toMatchObject({
      name: "Bea",
      schoolId: "school-b",
    });
  });
});

/**
 * Feature: the batch username check sees every school's usernames
 * Supports the bulk-import preview ("already-exists") and confirm re-validation.
 */
describe("Feature: SchoolDirectory.findExistingUsernames", () => {
  dbIt(
    "returns only the usernames already taken, in any school",
    async ({ db }) => {
      // Given two existing students, one in another school
      const students = new StudentService(db, TEST_SCHOOL_ID);
      await students.createStudentDocument({
        authUserId: "auth-1",
        username: "alice",
        name: "Alice",
        createdBy: "admin",
      });
      await new StudentService(db, "school-b").createStudentDocument({
        authUserId: "auth-2",
        username: "bob",
        name: "Bob",
        createdBy: "admin",
      });

      // When checking a mix of existing and new usernames
      const existing = await new SchoolDirectory(db).findExistingUsernames([
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
      const students = new StudentService(db, TEST_SCHOOL_ID);
      await students.createStudentDocument({
        authUserId: "auth-1",
        username: "alice",
        name: "Alice",
        createdBy: "admin",
      });

      // When checking a non-empty list of all-new usernames
      const existing = await new SchoolDirectory(db).findExistingUsernames([
        "charlie",
        "dave",
      ]);

      // Then nothing comes back
      expect(existing).toEqual([]);
    },
  );

  dbIt("returns an empty array for empty input", async ({ db }) => {
    // Given a student exists
    const students = new StudentService(db, TEST_SCHOOL_ID);
    await students.createStudentDocument({
      authUserId: "auth-1",
      username: "alice",
      name: "Alice",
      createdBy: "admin",
    });

    // When checking an empty list
    const existing = await new SchoolDirectory(db).findExistingUsernames([]);

    // Then nothing comes back
    expect(existing).toEqual([]);
  });
});

/**
 * Feature: the join flows resolve an invite to a course that has a school
 * As a visitor opening an invite link
 * I want a link to a course no school owns yet to look like any invalid link
 * So that no join step has to remember the "no school" check
 */
describe("Feature: the join flows resolve an invite to a course that has a school", () => {
  dbIt(
    "returns the course and school for an assigned course, and null for an unassigned or unknown token",
    async ({ db }) => {
      const courses = new CourseService(db, TEST_SCHOOL_ID);
      const assigned = await courses.createCourse({
        title: "Assigned",
        description: "",
        createdBy: "admin-1",
      });
      const assignedToken = await courses.getOrCreateInviteToken(assigned.id);
      // A legacy course no school owns yet, with a live link.
      await db.collection("course").insertOne({
        id: "unassigned-course",
        title: "Unassigned",
        description: "",
        inviteToken: "unassigned-token",
        schoolId: null,
        createdAt: new Date(),
        createdBy: "admin-1",
        updatedAt: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
      });
      const schoolDirectory = new SchoolDirectory(db);

      expect(
        await schoolDirectory.findAssignedInviteCourse(assignedToken),
      ).toMatchObject({
        course: { id: assigned.id },
        schoolId: TEST_SCHOOL_ID,
      });
      expect(
        await schoolDirectory.findAssignedInviteCourse("unassigned-token"),
      ).toBeNull();
      expect(
        await schoolDirectory.findAssignedInviteCourse("no-such-token"),
      ).toBeNull();
    },
  );
});
