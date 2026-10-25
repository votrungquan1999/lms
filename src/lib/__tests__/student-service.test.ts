import { ensureIndexes } from "src/lib/database";
import { type StudentDocument, StudentService } from "src/lib/student-service";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: a Better Auth sign-in account can hold only one student profile
 * As the LMS system
 * I want a second insert for the SAME sign-in account refused at the
 * database, told apart from an ordinary username clash
 * So that a raced or repeated provisioning attempt can never split one
 * person's identity across two student documents
 */
describe("Feature: a Better Auth sign-in account can hold only one student profile", () => {
  dbIt(
    "refuses a second student document for an authUserId that already has one, with its own message distinct from a username clash",
    async ({ db }) => {
      await ensureIndexes(db);
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      await studentService.createStudentDocument({
        authUserId: "auth-user-1",
        username: "first-username",
        name: "First Student",
        createdBy: "test",
      });

      // A DIFFERENT username, so this only exercises the authUserId clash,
      // never the pre-existing username find-first check.
      await expect(
        studentService.createStudentDocument({
          authUserId: "auth-user-1",
          username: "second-username",
          name: "Second Attempt",
          createdBy: "test",
        }),
      ).rejects.toThrow("This account already has a student profile");

      expect(
        await db
          .collection<StudentDocument>("student")
          .countDocuments({ authUserId: "auth-user-1" }),
      ).toBe(1);
    },
  );

  dbIt(
    "refuses a second profile for the same sign-in account even when it is created in another school",
    async ({ db }) => {
      await ensureIndexes(db);
      await new StudentService(db, TEST_SCHOOL_ID).createStudentDocument({
        authUserId: "auth-user-1",
        username: "first-username",
        name: "First Student",
        createdBy: "test",
      });

      await expect(
        new StudentService(db, "school-b").createStudentDocument({
          authUserId: "auth-user-1",
          username: "second-username",
          name: "Second Attempt",
          createdBy: "test",
        }),
      ).rejects.toThrow("This account already has a student profile");

      expect(
        await db
          .collection<StudentDocument>("student")
          .countDocuments({ authUserId: "auth-user-1" }),
      ).toBe(1);
    },
  );
});

/**
 * Feature: a student username can exist only once across all schools
 * As the LMS system
 * I want a username clash and a sign-in-account clash told apart by their
 * own message, in the same run
 * So that a swapped condition (the wrong reason shown for a refusal) is
 * caught, not just that a refusal happened at all
 */
describe("Feature: a student username can exist only once across all schools", () => {
  dbIt(
    "refuses a username clash and an authUserId clash with each its own message, never swapped",
    async ({ db }) => {
      await ensureIndexes(db);
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      await studentService.createStudentDocument({
        authUserId: "auth-user-shared",
        username: "shared-username",
        name: "First Student",
        createdBy: "test",
      });

      // Same username, a different sign-in account.
      await expect(
        studentService.createStudentDocument({
          authUserId: "auth-user-other",
          username: "shared-username",
          name: "Username Clash",
          createdBy: "test",
        }),
      ).rejects.toThrow("Username already exists");

      // Same sign-in account, a different username.
      await expect(
        studentService.createStudentDocument({
          authUserId: "auth-user-shared",
          username: "different-username",
          name: "AuthUserId Clash",
          createdBy: "test",
        }),
      ).rejects.toThrow("This account already has a student profile");

      expect(
        await db.collection<StudentDocument>("student").countDocuments({}),
      ).toBe(1);
    },
  );
});

/**
 * Feature: adding a student to a school reports whether the student exists
 * As a flow that brings a student into a school
 * I want to know when the student id matches nobody
 * So that it can refuse instead of silently adding nothing
 */
describe("Feature: adding a student to a school reports whether the student exists", () => {
  dbIt(
    "returns false for an unknown student and true, repeatably, for a known one",
    async ({ db }) => {
      const owner = new StudentService(db, "school-a");
      const student = await owner.createStudentDocument({
        authUserId: "auth-1",
        username: "ada",
        name: "Ada",
        createdBy: "admin-a",
      });
      const joining = new StudentService(db, "school-b");

      expect(await joining.addToSchool("no-such-student")).toBe(false);
      expect(await joining.addToSchool(student.id)).toBe(true);
      expect(await joining.addToSchool(student.id)).toBe(true);

      const [stored] = await joining.findByIds([student.id]);
      expect(stored.schoolIds.sort()).toEqual(["school-a", "school-b"]);
    },
  );
});
