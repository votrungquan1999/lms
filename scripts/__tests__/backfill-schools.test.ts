import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { Db, MongoClient } from "mongodb";
import { type AuthService, createAuthService } from "src/lib/auth-service";
import { SchoolService } from "src/lib/school-service";
import { isAdminSession } from "src/lib/session";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { signedInHeaders, testConfig } from "src/tests/auth-test-helpers";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

/** Extra or overriding fields for a raw seed row; `schoolId` is always passed explicitly. */
type RawFields = Record<string, unknown>;

const execFileAsync = promisify(execFile);
const dbIt = withTestDb(it);

const SCRIPTS_DIR = resolve(__dirname, "..");
const BACKFILL_SCRIPT = resolve(SCRIPTS_DIR, "backfill-schools.ts");

/** Runs the backfill script as a real bun subprocess against a given MONGODB_URI. */
async function runBackfillScript(
  mongoUri: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "bun",
      [BACKFILL_SCRIPT, ...args],
      {
        env: { ...process.env, MONGODB_URI: mongoUri },
        cwd: SCRIPTS_DIR,
        timeout: 15000,
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

/** Builds the mongodb:// URI for the test's own database, from its client. */
function mongoUriFor(client: MongoClient, dbName: string): string {
  return `${client.options.hosts
    .map((h) => `mongodb://${h.host}:${h.port}`)
    .join(",")}/${dbName}`;
}

/** Builds a real AuthService against the test db, with real dependencies. */
function realAuthService(db: Db): AuthService {
  return createAuthService(db, testConfig(), realAuthServiceDeps(db));
}

// Raw rows as the pre-multi-tenant build left them. Each caller states the
// row's school — `{ schoolId: null }`, a real id, or nothing for a missing key.

/** A raw course row. */
function rawCourse(id: string, fields: RawFields): RawFields {
  return {
    id,
    title: id,
    description: "",
    createdAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    materials: [],
    inviteToken: null,
    ...fields,
  };
}

/** A raw student row; the caller passes `authUserId` and `username` (or omits it). */
function rawStudent(id: string, fields: RawFields): RawFields {
  return {
    id,
    name: id,
    createdAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    ...fields,
  };
}

/** A raw question pool row. */
function rawPool(id: string, fields: RawFields): RawFields {
  return {
    id,
    name: id,
    description: "",
    createdAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...fields,
  };
}

/** A raw test row under the given course. */
function rawTest(id: string, courseId: string, fields: RawFields): RawFields {
  return {
    id,
    courseId,
    title: id,
    description: "",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
    answerRevealMode: "plain",
    timeLimitMinutes: null,
    isPractice: false,
    correctAnswersReleasedAt: null,
    gradesReleasedAt: null,
    createdAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...fields,
  };
}

/** A raw pending join request for the given course and student. */
function rawJoinRequest(
  id: string,
  courseId: string,
  studentId: string,
  fields: RawFields,
): RawFields {
  return {
    id,
    courseId,
    studentId,
    status: "pending",
    requestedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    ...fields,
  };
}

/** A raw enrollment of the given student in the given course. */
function rawEnrollment(
  id: string,
  courseId: string,
  studentId: string,
): RawFields {
  return {
    id,
    courseId,
    studentId,
    enrolledAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
  };
}

/** A raw free-text pool question in the given pool. */
function rawPoolQuestion(
  id: string,
  poolId: string,
  fields: RawFields,
): RawFields {
  return {
    id,
    poolId,
    title: id,
    content: "",
    order: 0,
    createdAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    type: "free_text",
    options: null,
    weight: 1,
    mcGradingStrategy: null,
    explanation: null,
    referenceAnswer: null,
    answerRevealMode: null,
    media: [],
    deletedAt: null,
    deletedBy: null,
    ...fields,
  };
}

/**
 * Feature: the operator previews the school backfill before writing anything
 * As the operator
 * I want a dry run that reports what the backfill would do — duplicates,
 * unassigned roots and their children, split into orphans (parent missing)
 * and waiting children (parent exists but has no school yet)
 * So that I can review the plan before ever passing --apply
 */
describe("Feature: the operator previews the school backfill before writing anything", () => {
  dbIt(
    "reports unassigned roots and children as separate orphan/waiting categories, and writes nothing",
    async ({ db, client }) => {
      // Given: an unassigned course, student and pool; a test under a
      // nonexistent course (orphan); a test, join request and pool question
      // each pointing at an unassigned-but-real parent (waiting children).
      await db
        .collection("course")
        .insertOne(rawCourse("course-unassigned", { schoolId: null }));
      await db.collection("student").insertOne(
        rawStudent("student-unassigned", {
          authUserId: "auth-unassigned",
          username: "unassigned-student",
          schoolId: null,
        }),
      );
      await db
        .collection("question_pool")
        .insertOne(rawPool("pool-unassigned", { schoolId: null }));
      await db
        .collection("test")
        .insertMany([
          rawTest("test-orphan", "course-does-not-exist", { schoolId: null }),
          rawTest("test-waiting", "course-unassigned", { schoolId: null }),
        ]);
      await db
        .collection("course_join_request")
        .insertOne(
          rawJoinRequest(
            "request-waiting",
            "course-unassigned",
            "student-unassigned",
            { schoolId: null },
          ),
        );
      await db.collection("pool_question").insertOne(
        rawPoolQuestion("pool-question-waiting", "pool-unassigned", {
          schoolId: null,
        }),
      );

      // When: the script runs without --apply
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runBackfillScript(mongoUri);

      // Then: it exits cleanly and reports the target, plus orphan vs
      // waiting children as separate categories.
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout).toContain(db.databaseName);
      expect(result.stdout).toContain("No duplicate student username");
      expect(result.stdout).toContain("No duplicate student authUserId");
      expect(result.stdout).toContain(
        "Unassigned roots: 1 course(s), 1 student(s), 1 question pool(s)",
      );
      expect(result.stdout).toMatch(/1 orphan/);
      expect(result.stdout).toMatch(/3 waiting/);
      expect(result.stdout).toContain("Dry run only");

      // And: nothing was written — every record is exactly as seeded.
      expect(await db.collection("school").countDocuments({})).toBe(0);
      expect(
        (await db.collection("course").findOne({ id: "course-unassigned" }))
          ?.schoolId,
      ).toBeNull();
      expect(
        (await db.collection("student").findOne({ id: "student-unassigned" }))
          ?.schoolId,
      ).toBeNull();
      expect(
        (
          await db
            .collection("question_pool")
            .findOne({ id: "pool-unassigned" })
        )?.schoolId,
      ).toBeNull();
      expect(
        (await db.collection("test").findOne({ id: "test-waiting" }))?.schoolId,
      ).toBeNull();
      expect(
        (
          await db
            .collection("course_join_request")
            .findOne({ id: "request-waiting" })
        )?.schoolId,
      ).toBeNull();
      expect(
        (
          await db
            .collection("pool_question")
            .findOne({ id: "pool-question-waiting" })
        )?.schoolId,
      ).toBeNull();
    },
  );
});

/**
 * Feature: the backfill refuses to apply while duplicate students exist
 * As the operator
 * I want --apply to stop before writing anything if any two students share
 * a username or a sign-in account
 * So that the backfill never lets a raced pre-migration signup silently
 * pick one row and orphan the other once uniqueness is enforced
 */
describe("Feature: the backfill refuses to apply while duplicate students exist", () => {
  dbIt(
    "reports every duplicate username group (missing and null keys folded together) and every duplicate authUserId group, and refuses --apply",
    async ({ db, client }) => {
      // Given: two students who explicitly share a username; one with no
      // `username` key at all and one with `username: null` (a non-sparse
      // unique index treats these as the same colliding value); and two
      // students who share an authUserId (a raced sign-in-account link).
      await db.collection("student").insertMany([
        rawStudent("student-dup-a", {
          authUserId: "auth-dup-a",
          username: "dup-user",
          schoolId: null,
        }),
        rawStudent("student-dup-b", {
          authUserId: "auth-dup-b",
          username: "dup-user",
          schoolId: null,
        }),
        rawStudent("student-no-username-key", {
          authUserId: "auth-no-username-key",
          schoolId: null,
        }),
        rawStudent("student-null-username", {
          authUserId: "auth-null-username",
          username: null,
          schoolId: null,
        }),
        rawStudent("student-authid-dup-a", {
          authUserId: "auth-shared",
          username: "authid-dup-a",
          schoolId: null,
        }),
        rawStudent("student-authid-dup-b", {
          authUserId: "auth-shared",
          username: "authid-dup-b",
          schoolId: null,
        }),
      ]);
      // student-dup-a is enrolled in one course; student-dup-b in none — an
      // operator picking which duplicate to keep needs to see this.
      await db.collection("enrollment").insertOne({
        id: "enrollment-a",
        courseId: "course-x",
        studentId: "student-dup-a",
        enrolledAt: new Date(),
        createdBy: "seed",
        updatedAt: null,
        updatedBy: null,
      });

      // When: the operator runs --apply
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runBackfillScript(mongoUri, ["--apply"]);

      // Then: it exits cleanly, names both duplicate groups (2 username
      // groups: "dup-user" and the missing/null-key pair; 1 authUserId
      // group) and refuses to apply.
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout).toContain("2 duplicate student username");
      expect(result.stdout).toContain("student-dup-a");
      expect(result.stdout).toContain("student-dup-b");
      expect(result.stdout).toContain("student-no-username-key");
      expect(result.stdout).toContain("student-null-username");
      expect(result.stdout).toContain("1 duplicate student authUserId");
      expect(result.stdout).toContain("student-authid-dup-a");
      expect(result.stdout).toContain("student-authid-dup-b");
      expect(result.stdout).toContain("refusing to apply");

      // And: each duplicate is shown with enough detail to pick which one
      // to keep — its sign-in account, when it was created, and how many
      // courses it's enrolled in.
      expect(result.stdout).toContain("auth-dup-a");
      expect(result.stdout).toContain("1 enrollment");
      expect(result.stdout).toContain("0 enrollment");

      // And: nothing was written at all — no school, no membership, and the
      // uniqueness indexes this duplicate data would violate were never built.
      expect(await db.collection("school").countDocuments({})).toBe(0);
      expect(await db.collection("school_membership").countDocuments({})).toBe(
        0,
      );
      const studentIndexes = await db
        .collection("student")
        .listIndexes()
        .toArray();
      expect(studentIndexes.some((idx) => idx.name === "username_1")).toBe(
        false,
      );
    },
  );
});

/**
 * Feature: the operator applies the school backfill
 * As the operator
 * I want --apply to create the default school, stamp every unassigned root
 * and derive each child's school from its own parent, build the
 * correctness indexes and drop the old join-queue index
 * So that every pre-existing record becomes visible to the default
 * school's admins in one run
 */
describe("Feature: the operator applies the school backfill", () => {
  dbIt(
    "creates the default school, stamps roots and their children, builds the correctness indexes and drops the old queue index",
    async ({ db, client }) => {
      // Given: an unassigned course (missing key) and an explicitly
      // null-stamped student and pool; a waiting test, join request and
      // pool question under those parents; and one orphan test.
      await db.collection("course").insertOne(rawCourse("course-a", {}));
      await db.collection("student").insertOne(
        rawStudent("student-a", {
          authUserId: "auth-a",
          username: "student-a",
          schoolId: null,
        }),
      );
      await db
        .collection("question_pool")
        .insertOne(rawPool("pool-a", { schoolId: null }));
      await db
        .collection("test")
        .insertMany([
          rawTest("test-a", "course-a", { schoolId: null }),
          rawTest("test-orphan", "course-does-not-exist", { schoolId: null }),
        ]);
      await db.collection("course_join_request").insertOne(
        rawJoinRequest("request-a", "course-a", "student-a", {
          schoolId: null,
        }),
      );
      await db
        .collection("pool_question")
        .insertOne(
          rawPoolQuestion("pool-question-a", "pool-a", { schoolId: null }),
        );
      // And: the old unscoped join-queue index a pre-multi-tenant boot built
      await db
        .collection("course_join_request")
        .createIndex({ status: 1, requestedAt: 1, _id: 1 });

      // When: the operator runs --apply
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runBackfillScript(mongoUri, ["--apply"]);

      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // Then: the default school exists, and every root and child is
      // stamped with it, except the orphan test.
      const school = await db.collection("school").findOne({ slug: "default" });
      expect(school).not.toBeNull();
      const schoolId = school?.id as string;

      expect(
        (await db.collection("course").findOne({ id: "course-a" }))?.schoolId,
      ).toBe(schoolId);
      expect(
        (await db.collection("student").findOne({ id: "student-a" }))?.schoolId,
      ).toBe(schoolId);
      expect(
        (await db.collection("question_pool").findOne({ id: "pool-a" }))
          ?.schoolId,
      ).toBe(schoolId);
      expect(
        (await db.collection("test").findOne({ id: "test-a" }))?.schoolId,
      ).toBe(schoolId);
      expect(
        (
          await db
            .collection("course_join_request")
            .findOne({ id: "request-a" })
        )?.schoolId,
      ).toBe(schoolId);
      expect(
        (
          await db
            .collection("pool_question")
            .findOne({ id: "pool-question-a" })
        )?.schoolId,
      ).toBe(schoolId);
      expect(
        (await db.collection("test").findOne({ id: "test-orphan" }))?.schoolId,
      ).toBeNull();

      // And: the correctness indexes exist, and the old queue index is gone
      const studentIndexes = await db
        .collection("student")
        .listIndexes()
        .toArray();
      expect(studentIndexes.some((idx) => idx.name === "username_1")).toBe(
        true,
      );
      expect(studentIndexes.some((idx) => idx.name === "authUserId_1")).toBe(
        true,
      );
      const schoolIndexes = await db
        .collection("school")
        .listIndexes()
        .toArray();
      expect(schoolIndexes.some((idx) => idx.name === "slug_1")).toBe(true);
      const queueIndexes = await db
        .collection("course_join_request")
        .listIndexes()
        .toArray();
      expect(
        queueIndexes.some((idx) => idx.name === "status_1_requestedAt_1__id_1"),
      ).toBe(false);
    },
  );

  dbIt(
    "reports a child already stamped with a different school than its parent's, and leaves it as it is",
    async ({ db, client }) => {
      // Given: a course in one school, and a test under it stamped with another
      await db
        .collection("course")
        .insertOne(rawCourse("course-m", { schoolId: "school-x" }));
      await db
        .collection("test")
        .insertOne(
          rawTest("test-mismatch", "course-m", { schoolId: "school-y" }),
        );

      // When: the operator runs --apply
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runBackfillScript(mongoUri, ["--apply"]);

      // Then: the mismatch is reported for a manual decision, never rewritten
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout).toMatch(/1 mismatch/);
      expect(
        (await db.collection("test").findOne({ id: "test-mismatch" }))
          ?.schoolId,
      ).toBe("school-y");
    },
  );

  dbIt(
    "lists an enrollment whose course and student are in different schools, and leaves it as it is",
    async ({ db, client }) => {
      // Given: one enrollment crossing two schools, one inside a single school
      await db
        .collection("course")
        .insertOne(rawCourse("course-x", { schoolId: "school-x" }));
      await db.collection("student").insertMany([
        rawStudent("student-x", {
          authUserId: "auth-x",
          username: "student-x",
          schoolId: "school-x",
        }),
        rawStudent("student-y", {
          authUserId: "auth-y",
          username: "student-y",
          schoolId: "school-y",
        }),
      ]);
      await db
        .collection("enrollment")
        .insertMany([
          rawEnrollment("enrollment-cross", "course-x", "student-y"),
          rawEnrollment("enrollment-same", "course-x", "student-x"),
        ]);

      // When: the operator runs --apply
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runBackfillScript(mongoUri, ["--apply"]);

      // Then: only the crossing enrollment is listed, for a manual decision
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout).toContain(
        "Enrollments whose course and student are in different schools: 1",
      );
      expect(result.stdout).toContain(
        "enrollment-cross: course course-x (school-x), student student-y (school-y)",
      );
      expect(result.stdout).not.toContain("enrollment-same");
      // And: it is never rewritten or deleted
      expect(
        await db.collection("enrollment").findOne({ id: "enrollment-cross" }),
      ).toMatchObject({ courseId: "course-x", studentId: "student-y" });
    },
  );
});

/**
 * Feature: the backfill's default-school membership resolves through a
 * real sign-in
 * As the operator
 * I want an admin created through a real better-auth sign-up, then
 * backfilled, to work in the default school on their very next sign-in
 * So that the grant isn't just a raw row in `school_membership` but a
 * membership the app's own session resolution actually honors
 */
describe("Feature: the backfill's default-school membership resolves through a real sign-in", () => {
  dbIt(
    "gives a legacy admin an AuthService session whose school is the default school",
    async ({ db, client }) => {
      // Given: a real better-auth account, promoted to admin the way the
      // pre-multi-tenant build did it — a recorded role, no marker.
      const authService = realAuthService(db);
      const email = "teacher@example.com";
      const password = "password-123";
      await authService.auth.api.signUpEmail({
        body: { email, password, name: "Teacher" },
      });
      await db
        .collection("user")
        .updateOne({ email }, { $set: { role: "admin" } });

      // When: the operator applies the backfill — to a fresh database that
      // never had the old join-queue index, so its drop must tolerate that
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runBackfillScript(mongoUri, ["--apply"]);
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // Then: signing in through the real AuthService yields an admin
      // session whose active school is "default".
      const headers = await signedInHeaders(authService, email, password);
      const session = await authService.getSession(headers);
      if (!session || !isAdminSession(session)) {
        throw new Error("expected an admin session");
      }
      expect(session.school?.name).toBe("Default school");

      const defaultSchool = await db
        .collection("school")
        .findOne({ slug: "default" });
      expect(session.school?.id).toBe(defaultSchool?.id);
    },
  );
});

/**
 * Feature: rerunning the backfill never fights the owner's naming
 * As the operator
 * I want a rerun with a different --school-name to leave the already-
 * created default school's id and name untouched
 * So that the first apply's choice sticks, and a typo on a later rerun
 * can never silently rename production's default school
 */
describe("Feature: rerunning the backfill never fights the owner's naming", () => {
  dbIt(
    "keeps the default school's id and name, and its already-stamped rows, across a --school-name change",
    async ({ db, client }) => {
      // Given: one unassigned course
      await db
        .collection("course")
        .insertOne(rawCourse("course-a", { schoolId: null }));
      const mongoUri = mongoUriFor(client, db.databaseName);

      // When: the operator applies once, then reruns with a different name
      const first = await runBackfillScript(mongoUri, ["--apply"]);
      expect(first.exitCode, first.stderr).toBe(0);
      const schoolAfterFirst = await db
        .collection("school")
        .findOne({ slug: "default" });
      const courseAfterFirst = await db
        .collection("course")
        .findOne({ id: "course-a" });

      const second = await runBackfillScript(mongoUri, [
        "--apply",
        "--school-name",
        "Some Other Name",
      ]);
      expect(second.exitCode, second.stderr).toBe(0);

      // Then: the school's id and name are unchanged, and the course keeps
      // the same stamped id.
      const schoolAfterSecond = await db
        .collection("school")
        .findOne({ slug: "default" });
      expect(schoolAfterSecond?.id).toBe(schoolAfterFirst?.id);
      expect(schoolAfterSecond?.name).toBe(schoolAfterFirst?.name);
      expect(schoolAfterSecond?.name).not.toBe("Some Other Name");

      const courseAfterSecond = await db
        .collection("course")
        .findOne({ id: "course-a" });
      expect(courseAfterSecond?.schoolId).toBe(courseAfterFirst?.schoolId);
    },
  );
});

/**
 * Feature: a rerun after a second school exists never guesses or re-grants
 * As the operator
 * I want a rerun, once the owner has created a second school and managed
 * admins by hand, to leave that owner's decisions alone — no default
 * membership for a school-B-only admin or a removed one, no guessed
 * school for a still-unassigned root — while still deriving a child's
 * school from its own parent and still onboarding a genuinely new legacy
 * admin
 * So that the backfill stays safe to rerun forever, long after the owner
 * has started using the product
 */
describe("Feature: a rerun after a second school exists never guesses or re-grants", () => {
  dbIt(
    "skips school-B-only and removed admins, grants a fresh legacy admin, derives a child's school from its parent, and leaves other unassigned roots reported only",
    async ({ db, client }) => {
      const mongoUri = mongoUriFor(client, db.databaseName);
      const authService = realAuthService(db);
      const schoolService = new SchoolService(db);

      // Given: two legacy admins (role, no marker) before the first apply.
      const { user: admin2 } = await authService.auth.api.signUpEmail({
        body: {
          email: "admin2@example.com",
          password: "password-123",
          name: "Admin Two",
        },
      });
      const { user: admin3 } = await authService.auth.api.signUpEmail({
        body: {
          email: "admin3@example.com",
          password: "password-123",
          name: "Admin Three",
        },
      });
      await db
        .collection("user")
        .updateMany(
          { email: { $in: [admin2.email, admin3.email] } },
          { $set: { role: "admin" } },
        );

      // When: the operator applies once — both become default admins.
      const first = await runBackfillScript(mongoUri, ["--apply"]);
      expect(first.exitCode, first.stderr).toBe(0);
      const defaultSchool = await db
        .collection("school")
        .findOne({ slug: "default" });
      const defaultSchoolId = defaultSchool?.id as string;

      // And: the owner then removes admin2 from the default school by hand,
      // and creates a second school with its own admin.
      await schoolService.removeMembership(defaultSchoolId, admin2.id);
      const schoolB = await schoolService.createSchool({
        name: "School B",
        slug: "school-b",
        createdBy: "owner-1",
      });
      const { user: admin1 } = await authService.auth.api.signUpEmail({
        body: {
          email: "admin1@example.com",
          password: "password-123",
          name: "Admin One",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: admin1.email }, { $set: { role: "admin" } });
      await schoolService.addMembership(schoolB.id, admin1.id, "owner-1");

      // And: the old build promotes admin4 in between — a role, no marker.
      const { user: admin4 } = await authService.auth.api.signUpEmail({
        body: {
          email: "admin4@example.com",
          password: "password-123",
          name: "Admin Four",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: admin4.email }, { $set: { role: "admin" } });

      // And: school B has a course whose test was never stamped, plus a
      // freshly-created unassigned course, student and pool.
      await db
        .collection("course")
        .insertMany([
          rawCourse("course-b", { schoolId: schoolB.id, createdBy: "owner-1" }),
          rawCourse("course-unassigned-later", { schoolId: null }),
        ]);
      await db.collection("test").insertOne(
        rawTest("test-under-b", "course-b", {
          schoolId: null,
          createdBy: "owner-1",
        }),
      );
      await db.collection("student").insertOne(
        rawStudent("student-unassigned-later", {
          authUserId: "auth-unassigned-later",
          username: "unassigned-later",
          schoolId: null,
        }),
      );
      await db
        .collection("question_pool")
        .insertOne(rawPool("pool-unassigned-later", { schoolId: null }));

      // When: the operator reruns --apply
      const second = await runBackfillScript(mongoUri, ["--apply"]);

      // Then: it reports the still-unassigned roots instead of guessing.
      expect(
        second.exitCode,
        `Script failed:\nstdout: ${second.stdout}\nstderr: ${second.stderr}`,
      ).toBe(0);
      expect(second.stdout).toContain("Another school already exists");
      expect(second.stdout).toContain(
        "Unassigned roots: 1 course(s), 1 student(s), 1 question pool(s)",
      );

      // And: admin1 (school-B-only) and admin2 (removed by hand) get no
      // default membership; admin3 keeps the one from the first run, and
      // admin4 (a legacy admin new since then) is granted one now.
      const membershipsForDefault = await db
        .collection("school_membership")
        .find({ schoolId: defaultSchoolId })
        .toArray();
      const defaultMemberUserIds = membershipsForDefault.map((m) => m.userId);
      expect(defaultMemberUserIds).not.toContain(admin1.id);
      expect(defaultMemberUserIds).not.toContain(admin2.id);
      expect(defaultMemberUserIds).toContain(admin3.id);
      expect(defaultMemberUserIds).toContain(admin4.id);

      // And: the test under school B's course is stamped B, not default.
      expect(
        (await db.collection("test").findOne({ id: "test-under-b" }))?.schoolId,
      ).toBe(schoolB.id);

      // And: the freshly unassigned course, student and pool are left
      // exactly as they were — no guessed school.
      expect(
        (
          await db
            .collection("course")
            .findOne({ id: "course-unassigned-later" })
        )?.schoolId,
      ).toBeNull();
      expect(
        (
          await db
            .collection("student")
            .findOne({ id: "student-unassigned-later" })
        )?.schoolId,
      ).toBeNull();
      expect(
        (
          await db
            .collection("question_pool")
            .findOne({ id: "pool-unassigned-later" })
        )?.schoolId,
      ).toBeNull();
    },
  );
});

/**
 * Feature: the backfill retracts a stale default membership, but never an
 * admin's
 * As the operator
 * I want a rerun to delete a default membership left behind by an old
 * build's role-only admin revoke, while leaving alone the membership of
 * anyone still an admin
 * So that an admin revoked before this feature shipped loses their stale
 * default-school access, and a re-grant later restores only the school it
 * names
 */
describe("Feature: the backfill retracts a stale default membership, but never an admin's", () => {
  dbIt(
    "deletes a non-admin's stale default membership left by an old build's role-only revoke, and leaves a current admin's membership alone",
    async ({ db, client }) => {
      const mongoUri = mongoUriFor(client, db.databaseName);
      const authService = realAuthService(db);

      // Given: two legacy admins, both granted default membership by a
      // first apply (the grant stamps the marker on both).
      const { user: staleUser } = await authService.auth.api.signUpEmail({
        body: {
          email: "stale@example.com",
          password: "password-123",
          name: "Stale",
        },
      });
      const { user: activeUser } = await authService.auth.api.signUpEmail({
        body: {
          email: "active@example.com",
          password: "password-123",
          name: "Active",
        },
      });
      await db
        .collection("user")
        .updateMany(
          { email: { $in: [staleUser.email, activeUser.email] } },
          { $set: { role: "admin" } },
        );
      const first = await runBackfillScript(mongoUri, ["--apply"]);
      expect(first.exitCode, first.stderr).toBe(0);
      const defaultSchool = await db
        .collection("school")
        .findOne({ slug: "default" });
      const defaultSchoolId = defaultSchool?.id as string;

      // And: staleUser is revoked the way the OLD, pre-multi-tenant build
      // does it — a bare role flip, oblivious to the marker the earlier
      // grant already stamped. activeUser stays an admin.
      await db
        .collection("user")
        .updateOne({ email: staleUser.email }, { $set: { role: "student" } });

      // And: that leaves the membership in place with the marker still set,
      // the state a marker-gated retraction would never reach.
      expect(
        await db
          .collection("school_membership")
          .findOne({ schoolId: defaultSchoolId, userId: staleUser.id }),
      ).not.toBeNull();
      expect(
        (await db.collection("user").findOne({ email: staleUser.email }))
          ?.schoolAccessManagedAt,
      ).toBeInstanceOf(Date);

      // When: the operator reruns --apply
      const second = await runBackfillScript(mongoUri, ["--apply"]);
      expect(second.exitCode, second.stderr).toBe(0);

      // Then: staleUser's default membership is gone — the marker left
      // over from the grant does not protect a membership whose user is
      // no longer an admin.
      const staleMembership = await db
        .collection("school_membership")
        .findOne({ schoolId: defaultSchoolId, userId: staleUser.id });
      expect(staleMembership).toBeNull();

      // And: activeUser's membership is untouched — retraction only ever
      // removes a non-admin's membership.
      const activeMembership = await db
        .collection("school_membership")
        .findOne({ schoolId: defaultSchoolId, userId: activeUser.id });
      expect(activeMembership).not.toBeNull();
    },
  );
});

describe("Feature: a backfill that stopped between an admin's membership and marker can be rerun", () => {
  dbIt(
    "stamps the marker of an admin who already has the default membership and still grants the other legacy admins",
    async ({ db, client }) => {
      const mongoUri = mongoUriFor(client, db.databaseName);
      const authService = realAuthService(db);

      // Given: a first apply created the default school and granted admin1.
      const { user: admin1 } = await authService.auth.api.signUpEmail({
        body: {
          email: "half@example.com",
          password: "password-123",
          name: "Half Granted",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: admin1.email }, { $set: { role: "admin" } });
      const first = await runBackfillScript(mongoUri, ["--apply"]);
      expect(first.exitCode, first.stderr).toBe(0);
      const defaultSchool = await db
        .collection("school")
        .findOne({ slug: "default" });
      const defaultSchoolId = defaultSchool?.id as string;

      // And: the run died after admin1's membership insert, before the marker.
      await db
        .collection("user")
        .updateOne(
          { email: admin1.email },
          { $unset: { schoolAccessManagedAt: "" } },
        );

      // And: another legacy admin was not reached yet.
      const { user: admin2 } = await authService.auth.api.signUpEmail({
        body: {
          email: "untouched@example.com",
          password: "password-123",
          name: "Untouched",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: admin2.email }, { $set: { role: "admin" } });

      // When: the operator reruns --apply
      const rerun = await runBackfillScript(mongoUri, ["--apply"]);

      // Then: it completes
      expect(rerun.exitCode, rerun.stderr).toBe(0);

      // And: the half-granted admin now carries the marker, with one membership
      const half = await db.collection("user").findOne({ email: admin1.email });
      expect(half?.schoolAccessManagedAt).toBeInstanceOf(Date);
      expect(
        await db
          .collection("school_membership")
          .countDocuments({ schoolId: defaultSchoolId, userId: admin1.id }),
      ).toBe(1);

      // And: the admin it had not reached is granted
      expect(
        await db
          .collection("school_membership")
          .findOne({ schoolId: defaultSchoolId, userId: admin2.id }),
      ).not.toBeNull();
    },
  );
});
