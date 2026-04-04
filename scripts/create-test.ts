/**
 * Bun script: Create a test with questions from a data file.
 *
 * Usage:
 *   bun scripts/create-test.ts scripts/data/my-test.ts
 *
 * Reads MONGODB_URI from env (Bun auto-loads .env.local) or defaults
 * to mongodb://localhost:27017/lms.
 */

import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { QuestionService } from "../src/lib/question-service";
import { TestService } from "../src/lib/test-service";
import type { TestDefinition } from "./types";

const SCRIPT_AUTHOR = "script";

async function main() {
  const rawPath = process.argv[2];
  if (!rawPath) {
    console.error("Usage: bun scripts/create-test.ts <data-file-path>");
    console.error(
      "Example: bun scripts/create-test.ts scripts/data/example-test.ts",
    );
    process.exit(1);
  }

  // Resolve to absolute path for dynamic import
  const dataFilePath = resolve(rawPath);
  const mod = await import(dataFilePath);
  const definition: TestDefinition = mod.default;

  if (!definition?.courseId || !definition?.test || !definition?.questions) {
    console.error(
      "❌ Data file must export a default TestDefinition with courseId, test, and questions",
    );
    process.exit(1);
  }

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/lms";
  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const db = client.db();
    const testService = new TestService(db);
    const questionService = new QuestionService(db);

    // Create the test
    const test = await testService.createTest(definition.courseId, {
      title: definition.test.title,
      description: definition.test.description,
      createdBy: SCRIPT_AUTHOR,
      showCorrectAnswerAfterSubmit:
        definition.test.showCorrectAnswerAfterSubmit,
      showGradeAfterSubmit: definition.test.showGradeAfterSubmit,
    });

    // Create questions with explicit type narrowing (same pattern as actions.ts)
    let created = 0;
    for (const q of definition.questions) {
      const type = q.type ?? "free_text";
      switch (type) {
        case "free_text":
          await questionService.addQuestion(test.id, {
            ...q,
            type: "free_text",
            createdBy: SCRIPT_AUTHOR,
          });
          break;
        case "single_select":
          await questionService.addQuestion(test.id, {
            ...q,
            type: "single_select",
            createdBy: SCRIPT_AUTHOR,
            // Cast strictly for TS overload resolution
          } as import("../src/lib/question-service").AddSingleSelectQuestionInput);
          break;
        case "multi_select":
          await questionService.addQuestion(test.id, {
            ...q,
            type: "multi_select",
            createdBy: SCRIPT_AUTHOR,
            // Cast strictly for TS overload resolution
          } as import("../src/lib/question-service").AddMultiSelectQuestionInput);
          break;
      }
      created++;
    }

    console.log(`✅ Created test "${test.title}" (id: ${test.id})`);
    console.log(
      `   → ${created} question(s) added to course ${definition.courseId}`,
    );
    console.log(
      `   → http://localhost:3000/admin/courses/${definition.courseId}/tests/${test.id}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
