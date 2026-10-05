import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { MongoClient } from "mongodb";
import { CourseService } from "src/lib/course-service";
import { QuestionPoolService } from "src/lib/question-pool-service";
import { SchoolService } from "src/lib/school-service";
import { StudentService } from "src/lib/student-service";
import { buildTestService } from "src/tests/build-test-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
// Seeding 15 students through the real scenario state machine is slower than
// the other subprocess scripts — give both the child process and the vitest
// test itself real headroom.
const SEED_SCRIPT_TIMEOUT_MS = 60000;
const dbIt = withTestDb(it);

const SCRIPTS_DIR = resolve(__dirname, "..");

// Mirror seed-test-states.ts's / seed-coding-test.ts's own stable ids — not
// exported, since the scripts have no other caller.
const COURSE_ID = "seed-course-fundamentals";
const TEST_VISIBLE_ID = "seed-test-visible";
const TEST_CODING_ID = "seed-test-python-coding";

/**
 * Helper: run one of the seed scripts as a real bun subprocess, against the
 * test's own throwaway database.
 */
async function runSeedScript(
  scriptName: string,
  args: string[],
  mongoUri: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);
  try {
    const { stdout, stderr } = await execFileAsync(
      "bun",
      [scriptPath, ...args],
      {
        env: { ...process.env, MONGODB_URI: mongoUri },
        cwd: SCRIPTS_DIR,
        timeout: SEED_SCRIPT_TIMEOUT_MS,
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

describe("seed-test-states script", () => {
  dbIt(
    "seeds the sandbox course, tests and students in the named school",
    async ({ db, client }) => {
      // When: the script is run with --school
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runSeedScript(
        "seed-test-states.ts",
        ["--school", "acme"],
        mongoUri,
      );

      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // Then: exactly the named school exists
      const schoolService = new SchoolService(db);
      const schools = await schoolService.listSchools();
      expect(schools).toHaveLength(1);
      const school = schools[0];
      if (!school) throw new Error("school not created");
      expect(school.slug).toBe("acme");

      // And: the sandbox course is visible through that school's bound course service
      const courseService = new CourseService(db, school.id);
      const courses = await courseService.listCourses();
      const sandboxCourse = courses.find(
        (c) => c.title === "Sandbox: Fundamentals",
      );
      expect(sandboxCourse).toBeDefined();
      if (!sandboxCourse) throw new Error("sandbox course not found");

      // And: both sandbox tests are visible through that school's bound test service
      const testService = buildTestService(db, school.id);
      const tests = await testService.listTests(sandboxCourse.id);
      expect(tests.map((t) => t.title).sort()).toEqual([
        "Sandbox: All visibility OFF",
        "Sandbox: All visibility ON",
      ]);

      // And: every seeded student is visible through that school's bound student service
      const studentService = new StudentService(db, school.id);
      const students = await studentService.listStudents();
      expect(students).toHaveLength(15);
      expect(students.map((s) => s.username)).toContain("alice");
    },
    SEED_SCRIPT_TIMEOUT_MS,
  );

  dbIt(
    "stamps a missing school onto sandbox rows an older build left behind, without erroring or duplicating",
    async ({ db, client }) => {
      // Given: sandbox course/test/student rows from before schools existed
      await db.collection("course").insertOne({
        id: COURSE_ID,
        title: "Sandbox: Fundamentals",
        description: "Seed course for clicking through every test state.",
        createdAt: new Date(),
        createdBy: "seed-script",
        updatedAt: null,
        updatedBy: null,
        schoolId: null,
      });
      await db.collection("test").insertOne({
        id: TEST_VISIBLE_ID,
        courseId: COURSE_ID,
        title: "Sandbox: All visibility ON",
        description: "old",
        showCorrectAnswerAfterSubmit: true,
        showGradeAfterSubmit: true,
        answerRevealMode: "plain",
        correctAnswersReleasedAt: null,
        gradesReleasedAt: null,
        createdAt: new Date(),
        createdBy: "seed-script",
        updatedAt: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        schoolId: null,
      });
      await db.collection("student").insertOne({
        id: crypto.randomUUID(),
        authUserId: "seed-auth-alice",
        username: "alice",
        name: "Alice NotStarted",
        createdAt: new Date(),
        createdBy: "seed-script",
        updatedAt: null,
        updatedBy: null,
        schoolId: null,
      });

      // When: the script is run with --school
      const mongoUri = mongoUriFor(client, db.databaseName);
      const result = await runSeedScript(
        "seed-test-states.ts",
        ["--school", "acme"],
        mongoUri,
      );

      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // Then: the pre-existing rows now carry the named school
      const schoolService = new SchoolService(db);
      const schools = await schoolService.listSchools();
      expect(schools).toHaveLength(1);
      const school = schools[0];
      if (!school) throw new Error("school not created");

      const course = await db.collection("course").findOne({ id: COURSE_ID });
      expect(course?.schoolId).toBe(school.id);
      const test = await db.collection("test").findOne({ id: TEST_VISIBLE_ID });
      expect(test?.schoolId).toBe(school.id);
      const student = await db
        .collection("student")
        .findOne({ username: "alice" });
      expect(student?.schoolId).toBe(school.id);

      // And: no row was duplicated by the rerun
      expect(
        await db.collection("course").countDocuments({ id: COURSE_ID }),
      ).toBe(1);
      expect(
        await db.collection("student").countDocuments({ username: "alice" }),
      ).toBe(1);
    },
    SEED_SCRIPT_TIMEOUT_MS,
  );

  dbIt(
    "leaves sandbox rows in their school when rerun naming a different school",
    async ({ db, client }) => {
      // Given: the sandbox was seeded into one school
      const mongoUri = mongoUriFor(client, db.databaseName);
      const first = await runSeedScript(
        "seed-test-states.ts",
        ["--school", "acme"],
        mongoUri,
      );
      expect(
        first.exitCode,
        `Script failed:\nstdout: ${first.stdout}\nstderr: ${first.stderr}`,
      ).toBe(0);

      // When: the script is rerun naming another school
      const rerun = await runSeedScript(
        "seed-test-states.ts",
        ["--school", "other"],
        mongoUri,
      );
      expect(
        rerun.exitCode,
        `Script failed:\nstdout: ${rerun.stdout}\nstderr: ${rerun.stderr}`,
      ).toBe(0);

      // Then: the course, tests and students still belong to the first school
      const schools = await new SchoolService(db).listSchools();
      const acme = schools.find((s) => s.slug === "acme");
      if (!acme) throw new Error("school not created");

      const course = await db.collection("course").findOne({ id: COURSE_ID });
      expect(course?.schoolId).toBe(acme.id);
      const test = await db.collection("test").findOne({ id: TEST_VISIBLE_ID });
      expect(test?.schoolId).toBe(acme.id);
      const student = await db
        .collection("student")
        .findOne({ username: "alice" });
      expect(student?.schoolId).toBe(acme.id);
    },
    SEED_SCRIPT_TIMEOUT_MS,
  );
});

describe("seed-pools script", () => {
  dbIt(
    "seeds pools into the named school, and a second school gets its own pools independently",
    async ({ db, client }) => {
      const mongoUri = mongoUriFor(client, db.databaseName);

      // When: the script seeds pools into school A
      const resultA = await runSeedScript(
        "seed-pools.ts",
        ["--school", "school-a", "--mongo-uri", mongoUri],
        mongoUri,
      );
      expect(
        resultA.exitCode,
        `Script failed:\nstdout: ${resultA.stdout}\nstderr: ${resultA.stderr}`,
      ).toBe(0);

      // And: the script is run again, naming a different school
      const resultB = await runSeedScript(
        "seed-pools.ts",
        ["--school", "school-b", "--mongo-uri", mongoUri],
        mongoUri,
      );
      expect(
        resultB.exitCode,
        `Script failed:\nstdout: ${resultB.stdout}\nstderr: ${resultB.stderr}`,
      ).toBe(0);

      // Then: each school has its own 3 pools, unaffected by the other's run
      const schools = await new SchoolService(db).listSchools();
      const schoolA = schools.find((s) => s.slug === "school-a");
      const schoolB = schools.find((s) => s.slug === "school-b");
      if (!schoolA || !schoolB) throw new Error("schools not created");

      const poolsA = await new QuestionPoolService(db, schoolA.id).listPools();
      const poolsB = await new QuestionPoolService(db, schoolB.id).listPools();

      const expectedNames = [
        "Algebra Fundamentals",
        "General Science",
        "Geometry Basics",
      ];
      expect(poolsA.map((p) => p.name).sort()).toEqual(expectedNames);
      expect(poolsB.map((p) => p.name).sort()).toEqual(expectedNames);
    },
    SEED_SCRIPT_TIMEOUT_MS,
  );

  dbIt(
    "refuses a remote URI even when 'localhost' appears elsewhere in it",
    async ({ client }) => {
      // "localhost" is a substring of the db name here, but the actual
      // host is remote — the guard must parse the host, not grep the URI.
      const remoteUri =
        "mongodb://remote-host.example.com:27017/localhost-sandbox";

      const result = await runSeedScript(
        "seed-pools.ts",
        ["--school", "school-c", "--mongo-uri", remoteUri],
        mongoUriFor(client, "unused"),
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("is not a local database");
    },
    SEED_SCRIPT_TIMEOUT_MS,
  );
});

describe("seed-coding-test script", () => {
  dbIt(
    "lands its test in the sandbox course's school, after seed-test-states has run",
    async ({ db, client }) => {
      const mongoUri = mongoUriFor(client, db.databaseName);

      // Given: the sandbox course already exists, in a named school
      const seedResult = await runSeedScript(
        "seed-test-states.ts",
        ["--school", "acme"],
        mongoUri,
      );
      expect(
        seedResult.exitCode,
        `seed-test-states failed:\nstdout: ${seedResult.stdout}\nstderr: ${seedResult.stderr}`,
      ).toBe(0);

      // When: the coding test script is run against the same database
      const codingResult = await runSeedScript(
        "seed-coding-test.ts",
        [],
        mongoUri,
      );
      expect(
        codingResult.exitCode,
        `seed-coding-test failed:\nstdout: ${codingResult.stdout}\nstderr: ${codingResult.stderr}`,
      ).toBe(0);

      // Then: its test is visible through the sandbox course's own school
      const schoolService = new SchoolService(db);
      const school = (await schoolService.listSchools()).find(
        (s) => s.slug === "acme",
      );
      if (!school) throw new Error("school not created");

      const testService = buildTestService(db, school.id);
      const tests = await testService.listTests(COURSE_ID);
      expect(tests.map((t) => t.id)).toContain(TEST_CODING_ID);
    },
    SEED_SCRIPT_TIMEOUT_MS,
  );
});
