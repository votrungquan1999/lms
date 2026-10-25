import { type Db, ObjectId } from "mongodb";
import {
  type CourseJoinRequestDocument,
  CourseJoinRequestService,
} from "src/lib/course-join-request-service";
import { ensureIndexes } from "src/lib/database";
import {
  GoogleProvisionOutcome,
  provisionGoogleStudent,
} from "src/lib/google-student-provisioner";
import { SchoolDirectory } from "src/lib/school-directory";
import { type StudentDocument, StudentService } from "src/lib/student-service";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import { describe, expect, it, vi } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: a prospective student can join using their Google account instead
 * of choosing a password
 * As a prospective student
 * I want to sign in with Google from the invite page
 * So that I don't have to pick a username and password to join a course
 */
describe("Feature: a prospective student can join using their Google account instead of choosing a password", () => {
  dbIt(
    "provisions a student account from the Google identity and requests to join the invited course",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      // Given a raw Better Auth user already exists — standing in for what a
      // real Google OAuth round trip would have produced before this
      // function is ever called.
      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "prospective.student@gmail.com",
        name: "Prospective Student",
        role: "student",
      });

      // When the invite page provisions them for a specific course
      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "prospective.student@gmail.com",
          name: "Prospective Student",
          courseId: "course-1",
        },
      );

      // Then a student account is created, derived from the email's local part
      expect(outcome).toBe(GoogleProvisionOutcome.Provisioned);
      const student = await schoolDirectory.findByUsername(
        "prospective.student",
      );
      expect(student).not.toBeNull();
      expect(student?.name).toBe("Prospective Student");

      // And its authUserId is the SAME raw Google identity — this is the
      // field classify() uses to resolve a future session; a wrong id here
      // would "provision successfully" by every assertion above while
      // leaving the person unable to ever sign back in.
      const studentDoc = await db
        .collection("student")
        .findOne({ username: "prospective.student" });
      expect(studentDoc?.authUserId).toBe(rawUserId.toHexString());

      // And a pending request to join that course is waiting for admins
      const pending = await courseJoinRequestService.getPendingRequest(
        "course-1",
        student?.id ?? "",
      );
      expect(pending).not.toBeNull();
    },
  );

  dbIt(
    "lowercases, strips, but does not otherwise mangle a mixed-case email with an in-charset symbol",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "Prospective.Student+tag@Gmail.com",
        name: "Prospective Student",
        role: "student",
      });

      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "Prospective.Student+tag@Gmail.com",
          name: "Prospective Student",
          courseId: "course-1",
        },
      );

      // Lowercased and left otherwise intact — "+tag" is in-charset, so
      // stripping and truncation must not touch it.
      expect(outcome).toBe(GoogleProvisionOutcome.Provisioned);
      const student = await schoolDirectory.findByUsername(
        "prospective.student+tag",
      );
      expect(student).not.toBeNull();
    },
  );
});

/**
 * Feature: re-entering the invite page after already being provisioned
 * never creates a second student or a second join request
 * As a prospective student who reloaded, went back, or opened the link in a
 * second tab after already signing in with Google
 * I want re-provisioning my own identity to be a no-op
 * So that I never end up with two student records or two pending requests (M2)
 */
describe("Feature: re-entering the invite page after already being provisioned never creates a second student or join request", () => {
  dbIt(
    "provisioning the same Google identity a second time is a no-op, not a self-collision refusal",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "repeat.visitor@gmail.com",
        name: "Repeat Visitor",
        role: "student",
      });

      const input = {
        authUserId: rawUserId.toHexString(),
        email: "repeat.visitor@gmail.com",
        name: "Repeat Visitor",
        courseId: "course-1",
      };
      const deps = {
        studentService,
        schoolDirectory,
        courseJoinRequestService,
      };

      // Given the identity was already provisioned once
      const firstOutcome = await provisionGoogleStudent(deps, input);
      expect(firstOutcome).toBe(GoogleProvisionOutcome.Provisioned);

      // When the same page render happens again (reload, back button, a
      // second tab) for the SAME authUserId
      const secondOutcome = await provisionGoogleStudent(deps, input);

      // Then it is reported as provisioned again, not refused — and
      // critically the caller's own auth user must survive, since without
      // this guard the second call would find its own just-created username
      // "taken" and roll back the identity the caller is using right now
      expect(secondOutcome).toBe(GoogleProvisionOutcome.Provisioned);
      expect(
        await db.collection("user").findOne({ _id: rawUserId }),
      ).not.toBeNull();

      // And exactly one student and one pending request exist, not two
      expect(await studentService.listStudents()).toHaveLength(1);
      const student = await schoolDirectory.findByUsername("repeat.visitor");
      expect(
        await db
          .collection("course_join_request")
          .countDocuments({ courseId: "course-1", studentId: student?.id }),
      ).toBe(1);
    },
  );
});

/**
 * Feature: a Google signup whose derived username collides or is invalid
 * falls back to letting the person choose their own, instead of being
 * refused
 * As a prospective student whose Google email happens to derive a taken or
 * unusable username
 * I want to pick my own username and keep going
 * So that I am never told to "sign in with your original method" when I
 * have no original method to sign in with (D49)
 */
describe("Feature: a Google signup whose derived username collides or is invalid falls back to letting the person choose their own", () => {
  dbIt(
    "reports NeedsUsername instead of refusing, and does not roll back the Google identity that already exists",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      // Given a student already exists with the username this Google
      // signup's email local-part would derive
      await studentService.createStudentDocument({
        authUserId: "existing-auth-id",
        username: "prospective.student",
        name: "Existing Student",
        createdBy: "admin-1",
      });

      // And a raw Better Auth user/account/session already exist — Google's
      // round trip completes before this function is ever called
      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "prospective.student@gmail.com",
        name: "Someone Else",
        role: "student",
      });
      await db
        .collection("account")
        .insertOne({ userId: rawUserId, providerId: "google" });
      await db.collection("session").insertOne({ userId: rawUserId });

      // When the invite page tries to provision them for a course
      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "prospective.student@gmail.com",
          name: "Someone Else",
          courseId: "course-1",
        },
      );

      // Then the person is sent to the username chooser, not refused (D49)
      expect(outcome).toBe(GoogleProvisionOutcome.NeedsUsername);

      // And the existing student is untouched, with no second record created
      const students = await studentService.listStudents();
      expect(students).toHaveLength(1);
      expect(students[0].name).toBe("Existing Student");

      // And — unlike the old refusal — the person's Google identity survives:
      // there is no auth user to roll back on this path (D49), since they
      // will complete a profile against this SAME authUserId next
      expect(
        await db.collection("user").findOne({ _id: rawUserId }),
      ).not.toBeNull();
      expect(
        await db.collection("account").countDocuments({ userId: rawUserId }),
      ).toBe(1);
      expect(
        await db.collection("session").countDocuments({ userId: rawUserId }),
      ).toBe(1);
    },
  );

  dbIt(
    "reports NeedsUsername for a non-ASCII local part that derives the empty string, without crashing",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "田中太郎@example.com",
        name: "Taro Tanaka",
        role: "student",
      });

      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "田中太郎@example.com",
          name: "Taro Tanaka",
          courseId: "course-1",
        },
      );

      expect(outcome).toBe(GoogleProvisionOutcome.NeedsUsername);
      expect(await studentService.listStudents()).toHaveLength(0);
    },
  );

  dbIt(
    "reports NeedsUsername for a two-character local part, which fails the self-signup minimum length",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "ab@gmail.com",
        name: "AB Person",
        role: "student",
      });

      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "ab@gmail.com",
          name: "AB Person",
          courseId: "course-1",
        },
      );

      expect(outcome).toBe(GoogleProvisionOutcome.NeedsUsername);
      expect(await studentService.listStudents()).toHaveLength(0);
    },
  );
});

/**
 * Counts every student document for one sign-in account, in any school.
 * @param db - The test's isolated database.
 * @param authUserId - The sign-in account.
 * @returns How many student profiles that account holds.
 */
async function countProfiles(db: Db, authUserId: string): Promise<number> {
  return db
    .collection<StudentDocument>("student")
    .countDocuments({ authUserId });
}

/**
 * Counts the join requests filed for one course, in any school.
 * @param db - The test's isolated database.
 * @param courseId - The invite link's course.
 * @returns How many join requests exist for that course.
 */
async function countJoinRequests(db: Db, courseId: string): Promise<number> {
  return db
    .collection<CourseJoinRequestDocument>("course_join_request")
    .countDocuments({ courseId });
}

/**
 * Feature: two renders finishing the same Google identity at once never
 * split it across two student documents
 * As a prospective student who reloaded, or opened the link in a second tab,
 * before the first render's write was visible to their own reads
 * I want the second render to land on the same "waiting for approval"
 * outcome, never a spurious username clash or a second profile
 * So that a race window can never do what a sequential re-entry already
 * doesn't, even though the reads that pass on the happy path can also go
 * stale mid-race
 */
describe("Feature: two renders finishing the same Google identity at once never split it across two student documents", () => {
  dbIt(
    "treats a second render's own-identity username collision as already provisioned, not a real clash",
    async ({ db }) => {
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "racer@gmail.com",
        name: "Racer",
        role: "student",
      });
      const input = {
        authUserId: rawUserId.toHexString(),
        email: "racer@gmail.com",
        name: "Racer",
        courseId: "course-1",
      };
      const deps = {
        studentService,
        schoolDirectory,
        courseJoinRequestService,
      };

      // Given the first render already provisioned this identity
      const firstOutcome = await provisionGoogleStudent(deps, input);
      expect(firstOutcome).toBe(GoogleProvisionOutcome.Provisioned);

      // When a second render's OWN "already provisioned?" read is stale (the
      // write already landed, but this read raced ahead of it) and falls
      // through to the username check, which finds this SAME identity's own
      // just-created row
      vi.spyOn(schoolDirectory, "findByAuthUserId").mockResolvedValueOnce(null);
      const secondOutcome = await provisionGoogleStudent(deps, input);

      // Then it is still reported as provisioned, never sent to pick a new
      // username for a "clash" that is really its own record
      expect(secondOutcome).toBe(GoogleProvisionOutcome.Provisioned);
      expect(await countProfiles(db, input.authUserId)).toBe(1);
      expect(await countJoinRequests(db, "course-1")).toBe(1);
    },
  );

  dbIt(
    "treats a second render whose create is refused as a duplicate username as already provisioned, without creating a second document",
    async ({ db }) => {
      await ensureIndexes(db);
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "double-racer@gmail.com",
        name: "Double Racer",
        role: "student",
      });
      const input = {
        authUserId: rawUserId.toHexString(),
        email: "double-racer@gmail.com",
        name: "Double Racer",
        courseId: "course-1",
      };
      const deps = {
        studentService,
        schoolDirectory,
        courseJoinRequestService,
      };

      const firstOutcome = await provisionGoogleStudent(deps, input);
      expect(firstOutcome).toBe(GoogleProvisionOutcome.Provisioned);

      // When a second render's OWN authUserId AND username reads both land
      // before the first render's write, only the create itself can refuse
      // the duplicate — here as a taken username
      vi.spyOn(schoolDirectory, "findByAuthUserId").mockResolvedValueOnce(null);
      vi.spyOn(schoolDirectory, "findByUsername").mockResolvedValueOnce(null);
      const secondOutcome = await provisionGoogleStudent(deps, input);

      expect(secondOutcome).toBe(GoogleProvisionOutcome.Provisioned);
      expect(await countProfiles(db, input.authUserId)).toBe(1);
      expect(await countJoinRequests(db, "course-1")).toBe(1);
    },
  );

  dbIt(
    "treats a second render refused by the one-profile-per-account index as already provisioned, without creating a second document",
    async ({ db }) => {
      await ensureIndexes(db);
      const studentService = new StudentService(db, TEST_SCHOOL_ID);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "late.racer@gmail.com",
        name: "Late Racer",
        role: "student",
      });
      const input = {
        authUserId: rawUserId.toHexString(),
        email: "late.racer@gmail.com",
        name: "Late Racer",
        courseId: "course-1",
      };

      // Given the first tab finished with a username the person picked, so
      // the derived "late.racer" is still free
      const picked = await studentService.createStudentDocument({
        authUserId: input.authUserId,
        username: "picked-name",
        name: input.name,
        createdBy: "google-signup",
      });
      await courseJoinRequestService.createRequest({
        courseId: "course-1",
        studentId: picked.id,
      });

      // When a second tab's "already provisioned?" read is stale, only the
      // authUserId unique index can refuse its insert
      vi.spyOn(schoolDirectory, "findByAuthUserId").mockResolvedValueOnce(null);
      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        input,
      );

      expect(outcome).toBe(GoogleProvisionOutcome.Provisioned);
      expect(await countProfiles(db, input.authUserId)).toBe(1);
      expect(await countJoinRequests(db, "course-1")).toBe(1);
    },
  );
});

/**
 * Feature: a derived username taken by someone else's profile still sends
 * the person to pick their own, even when that other profile is in a
 * different school
 * As a prospective student whose Google email happens to derive a username
 * some other school's student already holds
 * I want to be sent to the username chooser, not silently merged with a
 * stranger's account
 * So that global username uniqueness is honored the same way across every
 * school, not only within one
 */
describe("Feature: a derived username taken by another school's student still sends the person to pick their own", () => {
  dbIt(
    "reports NeedsUsername for a username already held in a DIFFERENT school, and creates no document anywhere",
    async ({ db }) => {
      const schoolBStudentService = new StudentService(db, "school-b");
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        TEST_SCHOOL_ID,
      );
      const schoolDirectory = new SchoolDirectory(db);

      // Given a student in ANOTHER school already holds the username this
      // signup's email would derive
      await schoolBStudentService.createStudentDocument({
        authUserId: "existing-in-school-b",
        username: "shared.name",
        name: "Existing In School B",
        createdBy: "admin-b",
      });

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "shared.name@gmail.com",
        name: "New Signup",
        role: "student",
      });

      const outcome = await provisionGoogleStudent(
        {
          studentService: new StudentService(db, TEST_SCHOOL_ID),
          schoolDirectory,
          courseJoinRequestService,
        },
        {
          authUserId: rawUserId.toHexString(),
          email: "shared.name@gmail.com",
          name: "New Signup",
          courseId: "course-1",
        },
      );

      expect(outcome).toBe(GoogleProvisionOutcome.NeedsUsername);
      expect(await countProfiles(db, rawUserId.toHexString())).toBe(0);
      expect(await countJoinRequests(db, "course-1")).toBe(0);
    },
  );
});

/**
 * Feature: a Google sign-up whose account already belongs to another school
 * is offered the request to join
 * As a student of one school who opens another school's invite
 * I want my request to reach that school's admin
 * So that I am never told the link is not for me
 */
describe("Feature: a Google sign-up whose account already belongs to another school asks to join the invite's school", () => {
  dbIt(
    "reports Provisioned and writes a pending request in the invite's school when the account's profile is in another school",
    async ({ db }) => {
      const inviteSchoolId = "school-b";
      const studentService = new StudentService(db, inviteSchoolId);
      const courseJoinRequestService = new CourseJoinRequestService(
        db,
        inviteSchoolId,
      );
      const schoolDirectory = new SchoolDirectory(db);

      // Given the Google account already has a profile in the default school
      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "two.schools@gmail.com",
        name: "Two Schools",
        role: "student",
      });
      const profile = await new StudentService(
        db,
        TEST_SCHOOL_ID,
      ).createStudentDocument({
        authUserId: rawUserId.toHexString(),
        username: "two.schools",
        name: "Two Schools",
        createdBy: "google-signup",
      });

      // When the invite page provisions it for a course in school B
      const outcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "two.schools@gmail.com",
          name: "Two Schools",
          courseId: "course-b",
        },
      );

      // Then it is reported as waiting for approval
      expect(outcome).toBe(GoogleProvisionOutcome.Provisioned);

      // And one pending request for that student sits in school B
      const requests = await db
        .collection("course_join_request")
        .find({ courseId: "course-b" })
        .toArray();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        schoolId: inviteSchoolId,
        studentId: profile.id,
        status: "pending",
      });

      // And the profile stays in its own school only, with no second profile
      const after = await schoolDirectory.findByAuthUserId(
        rawUserId.toHexString(),
      );
      expect(after?.schoolIds).toEqual([TEST_SCHOOL_ID]);
      expect(await countProfiles(db, rawUserId.toHexString())).toBe(1);

      // And re-entering the invite page files no second request
      const secondOutcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "two.schools@gmail.com",
          name: "Two Schools",
          courseId: "course-b",
        },
      );
      expect(secondOutcome).toBe(GoogleProvisionOutcome.Provisioned);
      expect(
        await db
          .collection("course_join_request")
          .countDocuments({ courseId: "course-b", status: "pending" }),
      ).toBe(1);
    },
  );
});
