/**
 * Bun script: Seed a few sample question pools (the global "Question Bank")
 * so the pools feature can be tried end-to-end — browse the Question Bank,
 * open a pool, see authored questions, and "Add from pools" when editing a test.
 *
 * Usage:
 *   bun scripts/seed-pools.ts
 *
 * The target DB is HARDCODED to the local instance below (NOT read from env)
 * so this seed can never accidentally run against a staging/prod database.
 * Change LOCAL_MONGO_URI by hand if your local Mongo lives elsewhere.
 *
 * Idempotent: a pool is matched by name; if it already exists the script
 * leaves it (and its questions) untouched. To re-seed fresh, delete the pools
 * in the UI or drop the `question_pool` / `pool_question` collections.
 */

import { MongoClient } from "mongodb";
import { PoolQuestionService } from "../src/lib/pool-question-service";
import { QuestionPoolService } from "../src/lib/question-pool-service";

const SEED_AUTHOR = "seed-script";

/**
 * Hardcoded local target — intentionally NOT read from MONGODB_URI/.env.local
 * so this script can never seed test data into a non-local database.
 */
const LOCAL_MONGO_URI = "mongodb://localhost:27017/lms";

interface SeedQuestion {
  title: string;
  content: string;
  type: "free_text" | "single_select" | "multi_select";
  weight?: number;
  /** Required for single/multi select. */
  options?: { text: string; isCorrect: boolean }[];
  /** Required for multi_select. */
  mcGradingStrategy?: "all_or_nothing" | "partial";
}

interface SeedPool {
  name: string;
  description: string;
  questions: SeedQuestion[];
}

const POOLS: SeedPool[] = [
  {
    name: "Algebra Fundamentals",
    description: "Linear equations, inequalities, and basic factoring.",
    questions: [
      {
        title: "Solve a linear equation",
        content: "Solve for x: `3x + 6 = 21`. Show your working.",
        type: "free_text",
        weight: 5,
      },
      {
        title: "Slope of a line",
        content: "What is the slope of the line `y = 4x - 7`?",
        type: "single_select",
        options: [
          { text: "4", isCorrect: true },
          { text: "-7", isCorrect: false },
          { text: "7", isCorrect: false },
          { text: "1/4", isCorrect: false },
        ],
      },
      {
        title: "Which are quadratic expressions?",
        content: "Select every expression that is quadratic in x.",
        type: "multi_select",
        mcGradingStrategy: "partial",
        options: [
          { text: "x² + 3x + 2", isCorrect: true },
          { text: "2x - 5", isCorrect: false },
          { text: "5 - x²", isCorrect: true },
          { text: "x³ + 1", isCorrect: false },
        ],
      },
    ],
  },
  {
    name: "Geometry Basics",
    description: "Angles, triangles, and the properties of circles.",
    questions: [
      {
        title: "Angles in a triangle",
        content: "Two angles of a triangle are 50° and 60°. What is the third?",
        type: "single_select",
        options: [
          { text: "70°", isCorrect: true },
          { text: "80°", isCorrect: false },
          { text: "60°", isCorrect: false },
          { text: "110°", isCorrect: false },
        ],
      },
      {
        title: "Describe a right triangle",
        content:
          "In your own words, define a right triangle and give one real-world example.",
        type: "free_text",
        weight: 3,
      },
      {
        title: "True statements about a circle",
        content: "Select every statement that is true for any circle.",
        type: "multi_select",
        mcGradingStrategy: "all_or_nothing",
        options: [
          { text: "All radii are equal in length", isCorrect: true },
          { text: "The diameter is twice the radius", isCorrect: true },
          { text: "A circle has exactly four sides", isCorrect: false },
        ],
      },
    ],
  },
  {
    name: "General Science",
    description: "A mixed bag of introductory science questions.",
    questions: [
      {
        title: "States of matter",
        content: "Name the three common states of matter.",
        type: "free_text",
      },
      {
        title: "The closest planet to the Sun",
        content: "Which planet orbits closest to the Sun?",
        type: "single_select",
        options: [
          { text: "Mercury", isCorrect: true },
          { text: "Venus", isCorrect: false },
          { text: "Earth", isCorrect: false },
          { text: "Mars", isCorrect: false },
        ],
      },
    ],
  },
];

async function main() {
  const mongoUri = LOCAL_MONGO_URI;

  // Belt-and-braces: refuse to run unless the target is a local host. This
  // guards against the constant being edited to a remote URI by mistake.
  if (!/localhost|127\.0\.0\.1/.test(mongoUri)) {
    throw new Error(
      `Refusing to seed: ${mongoUri} is not a local database. This script only seeds localhost.`,
    );
  }

  console.log(`Seeding pools against ${mongoUri}`);

  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const db = client.db();
    const poolService = new QuestionPoolService(db);
    const poolQuestionService = new PoolQuestionService(db);

    const existingPools = await poolService.listPools();
    const existingByName = new Map(existingPools.map((p) => [p.name, p]));

    for (const seedPool of POOLS) {
      if (existingByName.has(seedPool.name)) {
        console.log(`  • pool "${seedPool.name}" already exists — skipping`);
        continue;
      }

      const pool = await poolService.createPool({
        name: seedPool.name,
        description: seedPool.description,
        createdBy: SEED_AUTHOR,
      });
      console.log(`  ✓ created pool "${pool.name}"`);

      for (const question of seedPool.questions) {
        if (question.type === "free_text") {
          await poolQuestionService.addPoolQuestion(pool.id, {
            type: "free_text",
            title: question.title,
            content: question.content,
            createdBy: SEED_AUTHOR,
            weight: question.weight,
          });
        } else if (question.type === "single_select") {
          await poolQuestionService.addPoolQuestion(pool.id, {
            type: "single_select",
            title: question.title,
            content: question.content,
            createdBy: SEED_AUTHOR,
            weight: question.weight,
            options: question.options ?? [],
          });
        } else {
          await poolQuestionService.addPoolQuestion(pool.id, {
            type: "multi_select",
            title: question.title,
            content: question.content,
            createdBy: SEED_AUTHOR,
            weight: question.weight,
            options: question.options ?? [],
            mcGradingStrategy: question.mcGradingStrategy ?? "all_or_nothing",
          });
        }
      }
      console.log(`    ↳ added ${seedPool.questions.length} questions`);
    }

    console.log("");
    console.log("Done.");
    console.log("Open the admin app → Question Bank to see the pools.");
    console.log(
      'Then edit any test and use "Add from Pools" to compose from them.',
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
