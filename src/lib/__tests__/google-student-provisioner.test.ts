import { ObjectId } from "mongodb";
import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { CourseJoinRequestService } from "src/lib/course-join-request-service";
import {
  GoogleProvisionOutcome,
  provisionGoogleStudent,
} from "src/lib/google-student-provisioner";
import { StudentService } from "src/lib/student-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const testConfig: AppConfig = {
  mongodbUri: "unused-in-test",
  authSecret: "test-secret",
  authAllowedHosts: ["localhost:3000"],
  google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
  s3: {
    bucket: "test-bucket",
    region: "ap-southeast-1",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  },
  adminEmails: [],
  trustedOrigins: [],
  allowPublicSignUp: false,
};

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
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);
      const courseJoinRequestService = new CourseJoinRequestService(db);

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
        { authService, studentService, courseJoinRequestService },
        {
          authUserId: rawUserId.toHexString(),
          email: "prospective.student@gmail.com",
          name: "Prospective Student",
          courseId: "course-1",
        },
      );

      // Then a student account is created, derived from the email's local part
      expect(outcome).toBe(GoogleProvisionOutcome.Provisioned);
      const student = await studentService.findByUsername(
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
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);
      const courseJoinRequestService = new CourseJoinRequestService(db);

      const rawUserId = new ObjectId();
      await db.collection("user").insertOne({
        _id: rawUserId,
        email: "Prospective.Student+tag@Gmail.com",
        name: "Prospective Student",
        role: "student",
      });

      const outcome = await provisionGoogleStudent(
        { authService, studentService, courseJoinRequestService },
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
      const student = await studentService.findByUsername(
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
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);
      const courseJoinRequestService = new CourseJoinRequestService(db);

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
      const deps = { authService, studentService, courseJoinRequestService };

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
      const student = await studentService.findByUsername("repeat.visitor");
      expect(
        await db
          .collection("course_join_request")
          .countDocuments({ courseId: "course-1", studentId: student?.id }),
      ).toBe(1);
    },
  );
});
