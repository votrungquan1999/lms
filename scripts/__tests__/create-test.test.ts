import { execFile } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { CourseService } from "src/lib/course-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { withTestDb } from "src/tests/create-test-db";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const dbIt = withTestDb(it);

const SCRIPTS_DIR = resolve(__dirname, "..");
const CREATE_TEST_SCRIPT = resolve(SCRIPTS_DIR, "create-test.ts");

/**
 * Helper: write a temporary data file and return its path.
 * The caller is responsible for cleanup.
 */
function writeTempDataFile(filename: string, content: string): string {
  const path = resolve(SCRIPTS_DIR, "__tests__", filename);
  writeFileSync(path, content, "utf-8");
  return path;
}

/**
 * Helper: run the create-test script with a data file and custom MONGODB_URI.
 */
async function runCreateTestScript(
  dataFilePath: string | null,
  mongoUri: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const args = dataFilePath
      ? [CREATE_TEST_SCRIPT, dataFilePath]
      : [CREATE_TEST_SCRIPT];
    const { stdout, stderr } = await execFileAsync("bun", args, {
      env: { ...process.env, MONGODB_URI: mongoUri },
      cwd: SCRIPTS_DIR,
      timeout: 15000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

describe("create-test script", () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        unlinkSync(f);
      } catch {
        // ignore
      }
    }
    tempFiles.length = 0;
  });

  dbIt(
    "should create a test with free-text questions in the database when run with a data file",
    async ({ db, client }) => {
      // Given: a course exists in the database
      const courseService = new CourseService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "For script testing",
        createdBy: "admin",
      });

      // And: a data file with free-text questions
      const dataFileContent = `
import type { TestDefinition } from "../types";

export default {
  courseId: "${course.id}",
  test: {
    title: "Script Created Test",
    description: "Created by the create-test script",
  },
  questions: [
    {
      type: "free_text",
      title: "Q1 - Essay",
      content: "Explain the concept of closures in JavaScript.",
    },
    {
      type: "free_text",
      title: "Q2 - Short Answer",
      content: "What is the difference between let and const?",
    },
  ],
} satisfies TestDefinition;
`;
      const dataFilePath = writeTempDataFile(
        `temp-free-text-${Date.now()}.ts`,
        dataFileContent,
      );
      tempFiles.push(dataFilePath);

      // When: the script is run
      const mongoUri = `${client.options.hosts
        .map((h) => `mongodb://${h.host}:${h.port}`)
        .join(",")}/${db.databaseName}`;

      const result = await runCreateTestScript(dataFilePath, mongoUri);

      // Then: the script exits successfully
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // And: the test was created in the database
      const testService = new TestService(db);
      const tests = await testService.listTests(course.id);
      expect(tests).toHaveLength(1);
      expect(tests[0].title).toBe("Script Created Test");
      expect(tests[0].description).toBe("Created by the create-test script");

      // And: the questions were created with correct ordering
      const questionService = new QuestionService(db);
      const questions = await questionService.listQuestions(tests[0].id);
      expect(questions).toHaveLength(2);
      expect(questions[0].title).toBe("Q1 - Essay");
      expect(questions[0].type).toBe("free_text");
      expect(questions[0].order).toBe(1);
      expect(questions[1].title).toBe("Q2 - Short Answer");
      expect(questions[1].type).toBe("free_text");
      expect(questions[1].order).toBe(2);
    },
  );

  dbIt(
    "should create single-select MC questions with correct options and exactly one correct answer",
    async ({ db, client }) => {
      // Given: a course exists
      const courseService = new CourseService(db);
      const course = await courseService.createCourse({
        title: "MC Course",
        description: "",
        createdBy: "admin",
      });

      // And: a data file with a single-select question
      const dataFileContent = `
import type { TestDefinition } from "../types";

export default {
  courseId: "${course.id}",
  test: {
    title: "Single Select Test",
    description: "Tests single-select MC",
  },
  questions: [
    {
      type: "single_select" as const,
      title: "What is 2+2?",
      content: "Choose the correct answer.",
      options: [
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
        { text: "5", isCorrect: false },
      ],
    },
  ],
} satisfies TestDefinition;
`;
      const dataFilePath = writeTempDataFile(
        `temp-single-select-${Date.now()}.ts`,
        dataFileContent,
      );
      tempFiles.push(dataFilePath);

      // When: the script is run
      const mongoUri = `${client.options.hosts
        .map((h) => `mongodb://${h.host}:${h.port}`)
        .join(",")}/${db.databaseName}`;

      const result = await runCreateTestScript(dataFilePath, mongoUri);

      // Then: the script exits successfully
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // And: the single-select question was created with correct options
      const testService = new TestService(db);
      const tests = await testService.listTests(course.id);
      const questionService = new QuestionService(db);
      const questions = await questionService.listQuestions(tests[0].id);

      expect(questions).toHaveLength(1);
      expect(questions[0].type).toBe("single_select");
      expect(questions[0].title).toBe("What is 2+2?");

      // And: the options are preserved with exactly one correct
      if (questions[0].type === "single_select") {
        expect(questions[0].options).toHaveLength(3);
        const correctOptions = questions[0].options.filter((o) => o.isCorrect);
        expect(correctOptions).toHaveLength(1);
        expect(correctOptions[0].text).toBe("4");
      }
    },
  );

  dbIt(
    "should create multi-select MC questions with the specified grading strategy",
    async ({ db, client }) => {
      // Given: a course exists
      const courseService = new CourseService(db);
      const course = await courseService.createCourse({
        title: "Multi-Select Course",
        description: "",
        createdBy: "admin",
      });

      // And: a data file with a multi-select question using partial grading
      const dataFileContent = `
import type { TestDefinition } from "../types";

export default {
  courseId: "${course.id}",
  test: {
    title: "Multi Select Test",
    description: "Tests multi-select MC with grading strategy",
  },
  questions: [
    {
      type: "multi_select" as const,
      title: "Select all primes",
      content: "Which numbers are prime?",
      options: [
        { text: "2", isCorrect: true },
        { text: "3", isCorrect: true },
        { text: "4", isCorrect: false },
        { text: "5", isCorrect: true },
      ],
      mcGradingStrategy: "partial" as const,
    },
  ],
} satisfies TestDefinition;
`;
      const dataFilePath = writeTempDataFile(
        `temp-multi-select-${Date.now()}.ts`,
        dataFileContent,
      );
      tempFiles.push(dataFilePath);

      // When: the script is run
      const mongoUri = `${client.options.hosts
        .map((h) => `mongodb://${h.host}:${h.port}`)
        .join(",")}/${db.databaseName}`;

      const result = await runCreateTestScript(dataFilePath, mongoUri);

      // Then: the script exits successfully
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      // And: the multi-select question has the correct grading strategy
      const testService = new TestService(db);
      const tests = await testService.listTests(course.id);
      const questionService = new QuestionService(db);
      const questions = await questionService.listQuestions(tests[0].id);

      expect(questions).toHaveLength(1);
      expect(questions[0].type).toBe("multi_select");

      if (questions[0].type === "multi_select") {
        expect(questions[0].options).toHaveLength(4);
        expect(questions[0].mcGradingStrategy).toBe("partial");
        const correctCount = questions[0].options.filter(
          (o) => o.isCorrect,
        ).length;
        expect(correctCount).toBe(3);
      }
    },
  );

  dbIt(
    "should print a summary with test ID, question count, and admin URL after running",
    async ({ db, client }) => {
      // Given: a course exists
      const courseService = new CourseService(db);
      const course = await courseService.createCourse({
        title: "Summary Course",
        description: "",
        createdBy: "admin",
      });

      // And: a data file with 2 questions
      const dataFileContent = `
import type { TestDefinition } from "../types";

export default {
  courseId: "${course.id}",
  test: {
    title: "Summary Test",
    description: "For summary output testing",
  },
  questions: [
    { type: "free_text" as const, title: "Q1", content: "Content 1" },
    { type: "free_text" as const, title: "Q2", content: "Content 2" },
  ],
} satisfies TestDefinition;
`;
      const dataFilePath = writeTempDataFile(
        `temp-summary-${Date.now()}.ts`,
        dataFileContent,
      );
      tempFiles.push(dataFilePath);

      // When: the script is run
      const mongoUri = `${client.options.hosts
        .map((h) => `mongodb://${h.host}:${h.port}`)
        .join(",")}/${db.databaseName}`;

      const result = await runCreateTestScript(dataFilePath, mongoUri);

      // Then: stdout contains the test title
      expect(result.stdout).toContain("Summary Test");

      // And: stdout contains the question count
      expect(result.stdout).toContain("2 question(s)");

      // And: stdout contains an admin URL with the course ID
      expect(result.stdout).toContain(`/admin/courses/${course.id}/tests/`);
    },
  );

  it("should show usage instructions when run without arguments", async () => {
    // When: the script is run without a data file path
    const result = await runCreateTestScript(
      null,
      "mongodb://localhost:27017/unused",
    );

    // Then: the script exits with a non-zero code
    expect(result.exitCode).not.toBe(0);

    // And: stderr contains usage instructions
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("bun scripts/create-test.ts");
  });
});
