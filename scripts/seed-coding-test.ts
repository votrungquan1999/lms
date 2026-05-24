/**
 * Bun script: Seed a new test of real Python coding questions, with
 * students submitting realistic correct / buggy / shortcut / blank answers
 * so the AI auto-grading feature has meaningful material to grade.
 *
 * Usage:
 *   bun scripts/seed-coding-test.ts
 *
 * Reads MONGODB_URI from env (Bun auto-loads .env.local) and defaults to
 * mongodb://localhost:27017/lms. Assumes the sandbox course from
 * `seed-test-states.ts` already exists; seeds a new test inside it.
 *
 * Idempotent: skips test creation if already present, and skips any
 * student that already exists (re-applying a submission would fail because
 * AnswerService/TestSubmissionService reject duplicates). To re-seed, drop
 * the student rows (or the whole `lms` database).
 */

import { type Db, MongoClient } from "mongodb";
import { AnswerService } from "../src/lib/answer-service";
import { EnrollmentService } from "../src/lib/enrollment-service";
import { GradeService } from "../src/lib/grade-service";
import { GradeVisibilityService } from "../src/lib/grade-visibility-service";
import { QuestionService } from "../src/lib/question-service";
import { StudentService } from "../src/lib/student-service";
import type { TestDocument } from "../src/lib/test-service";
import { TestService } from "../src/lib/test-service";
import { TestSubmissionService } from "../src/lib/test-submission-service";

const SEED_AUTHOR = "seed-script";

// Reuses the course created by `seed-test-states.ts`. If you haven't run
// that script yet, run it once first to materialise the course.
const COURSE_ID = "seed-course-fundamentals";
const TEST_ID = "seed-test-python-coding";

// ── Questions ───────────────────────────────────────────────────────────────
//
// Four simple Python exercises sourced from the existing data files in
// scripts/data/. Each question targets a single concept so a wrong answer
// is obviously wrong (helpful for verifying the AI judges correctly).

interface CodingQuestion {
  title: string;
  content: string;
  weight: number;
  /** Per-question student answers, keyed by student username. */
  answersByStudent: Record<string, string | null>;
}

const QUESTIONS: CodingQuestion[] = [
  {
    title: "Q1: Sum of a List",
    content: `Write a function \`total(nums)\` that returns the sum of all integers in a list using a loop. Do NOT use the built-in sum().

**Example:**
\`\`\`
total([4, 8, -3, 5, 2]) -> 16
\`\`\``,
    weight: 10,
    answersByStudent: {
      "perfect-pat": `def total(nums):
    s = 0
    for n in nums:
        s += n
    return s`,
      "buggy-ben": `def total(nums):
    s = 0
    for n in nums:
        s = n   # BUG: assignment instead of accumulation
    return s`,
      "mixed-mike": `def total(nums):
    s = 0
    for n in nums:
        s += n
    return s`,
      "shortcut-sam": `def total(nums):
    return sum(nums)   # uses the forbidden built-in`,
      "lazy-laura": `def total(nums):
    pass   # not implemented`,
    },
  },
  {
    title: "Q2: Count Even Numbers",
    content: `Write a function \`count_even(nums)\` that returns how many numbers in the list are even.

**Example:**
\`\`\`
count_even([1, 2, 4, 7, 8, 9, 10]) -> 4
\`\`\``,
    weight: 10,
    answersByStudent: {
      "perfect-pat": `def count_even(nums):
    c = 0
    for n in nums:
        if n % 2 == 0:
            c += 1
    return c`,
      "buggy-ben": `def count_even(nums):
    c = 0
    for n in nums:
        if n % 2 == 1:   # BUG: counts odd numbers
            c += 1
    return c`,
      "mixed-mike": `def count_even(nums):
    # forgot the 0 case is even
    c = 0
    for n in nums:
        if n > 0 and n % 2 == 0:   # BUG: excludes 0 and negatives
            c += 1
    return c`,
      "shortcut-sam": `def count_even(nums):
    return len([n for n in nums if n % 2 == 0])   # works but uses comprehension`,
      "lazy-laura": null, // left blank
    },
  },
  {
    title: "Q3: Find Max",
    content: `Write a function \`find_max(nums)\` that returns the largest number in a non-empty list. Do NOT use the built-in max().

**Example:**
\`\`\`
find_max([3, 17, 9, 25, 12, 25, 4]) -> 25
\`\`\``,
    weight: 10,
    answersByStudent: {
      "perfect-pat": `def find_max(nums):
    m = nums[0]
    for n in nums[1:]:
        if n > m:
            m = n
    return m`,
      "buggy-ben": `def find_max(nums):
    m = 0   # BUG: fails on all-negative lists
    for n in nums:
        if n > m:
            m = n
    return m`,
      "mixed-mike": `def find_max(nums):
    m = nums[0]
    for n in nums:
        if n < m:   # BUG: finds min instead of max
            m = n
    return m`,
      "shortcut-sam": `def find_max(nums):
    return max(nums)   # uses the forbidden built-in`,
      "lazy-laura": `def find_max(nums):
    return nums[0]   # only correct if first element happens to be the max`,
    },
  },
  {
    title: "Q4: Is Prime",
    content: `Write a function \`is_prime(n)\` that returns True if n is a prime number, False otherwise. Assume n >= 0.

**Example:**
\`\`\`
is_prime(13) -> True
is_prime(15) -> False
is_prime(1)  -> False
\`\`\``,
    weight: 10,
    answersByStudent: {
      "perfect-pat": `def is_prime(n):
    if n < 2:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False
        i += 1
    return True`,
      "buggy-ben": `def is_prime(n):
    # BUG: returns True for 0 and 1; doesn't reject them
    for i in range(2, n):
        if n % i == 0:
            return False
    return True`,
      "mixed-mike": null, // left blank — Mike has 2 correct, 2 not
      "shortcut-sam": `def is_prime(n):
    if n < 2:
        return False
    for i in range(2, n):
        if n % i == 0:
            return False
    return True`,
      "lazy-laura": `def is_prime(n):
    return n in [2, 3, 5, 7, 11, 13]   # hardcoded, fails for larger primes`,
    },
  },
];

// ── Students (one per "answer-profile") ─────────────────────────────────────

interface SeedStudent {
  username: string;
  name: string;
}

const STUDENTS: SeedStudent[] = [
  {
    username: "perfect-pat",
    name: "Pat Perfect (all 4 correct, follows constraints)",
  },
  {
    username: "buggy-ben",
    name: "Ben Buggy (all 4 attempt logic bugs)",
  },
  {
    username: "mixed-mike",
    name: "Mike Mixed (2 correct, 1 bug, 1 blank)",
  },
  {
    username: "shortcut-sam",
    name: "Sam Shortcut (correct results, uses banned built-ins)",
  },
  {
    username: "lazy-laura",
    name: "Laura Lazy (mostly blank or trivial answers)",
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/lms";
  console.log(`Seeding against ${mongoUri}`);

  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const db = client.db();

    const courseExists = await db
      .collection("course")
      .findOne({ id: COURSE_ID });
    if (!courseExists) {
      throw new Error(
        `Course ${COURSE_ID} does not exist. Run \`bun scripts/seed-test-states.ts\` first to seed the sandbox course.`,
      );
    }

    const testService = new TestService(db);
    const questionService = new QuestionService(db);
    const studentService = new StudentService(db);
    const enrollmentService = new EnrollmentService(db);
    const answerService = new AnswerService(db, questionService);

    let testSubmissionService!: TestSubmissionService;
    const gradeVisibilityService = new GradeVisibilityService(
      testService,
      () => Promise.resolve(testSubmissionService),
    );
    const gradeService = new GradeService(
      db,
      questionService,
      answerService,
      gradeVisibilityService,
    );
    testSubmissionService = new TestSubmissionService(db, gradeService);

    await ensureTest(db);
    await ensureQuestions(questionService);

    const questionsOnTest = await questionService.listQuestions(TEST_ID);
    if (questionsOnTest.length !== QUESTIONS.length) {
      throw new Error(
        `Expected ${QUESTIONS.length} questions on ${TEST_ID}, found ${questionsOnTest.length}`,
      );
    }
    // QuestionService.listQuestions returns in `order` ascending, so the
    // index alignment with QUESTIONS[i] matches the insertion order below.

    for (const seedStudent of STUDENTS) {
      const existing = await studentService.findByUsername(seedStudent.username);
      if (existing) {
        console.log(
          `  • student ${existing.username} already exists — skipping`,
        );
        continue;
      }

      const student = await studentService.createStudentDocument({
        authUserId: `seed-auth-${seedStudent.username}`,
        username: seedStudent.username,
        name: seedStudent.name,
        createdBy: SEED_AUTHOR,
      });
      console.log(`  ✓ created student ${student.username}`);

      try {
        await enrollmentService.enrollStudent(
          COURSE_ID,
          student.id,
          SEED_AUTHOR,
        );
      } catch {
        // Already enrolled.
      }

      // Submit each per-question answer (or skip if null = blank).
      for (let i = 0; i < QUESTIONS.length; i++) {
        const question = QUESTIONS[i];
        const targetQuestion = questionsOnTest[i];
        if (!question || !targetQuestion) continue;
        const answerText = question.answersByStudent[seedStudent.username];
        if (!answerText) continue;
        await answerService.submitAnswer({
          testId: TEST_ID,
          questionId: targetQuestion.id,
          studentId: student.id,
          answer: { type: "free_text", text: answerText },
        });
      }
      await testSubmissionService.submitTest(TEST_ID, student.id);
      console.log(`    ↳ submitted (${seedStudent.username})`);
    }

    console.log("");
    console.log("Done.");
    console.log("");
    console.log(`Course id: ${COURSE_ID}`);
    console.log(`Test id:   ${TEST_ID}`);
    console.log("");
    console.log(
      "Open the admin grading hub → Sandbox: Fundamentals → Python Coding Practice",
    );
    console.log(
      "All 5 students are Submitted with free-text code answers, no human grade.",
    );
    console.log("Click 'Auto-grade with AI' on any submission to test the AI.");
  } finally {
    await client.close();
  }
}

/**
 * Inserts the coding test with a stable id if it does not exist.
 */
async function ensureTest(db: Db): Promise<void> {
  const tests = db.collection<TestDocument>("test");
  const existing = await tests.findOne({ id: TEST_ID, deletedAt: null });
  if (existing) {
    console.log(`  • test ${TEST_ID} already exists`);
    return;
  }
  const doc: TestDocument = {
    id: TEST_ID,
    courseId: COURSE_ID,
    title: "Python Coding Practice (AI-grading fixture)",
    description:
      "Four simple Python coding exercises (sum, count even, find max, is prime). Free-text answers; submitted but not human-graded so the Auto-grade with AI button is available.",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
    correctAnswersReleasedAt: null,
    gradesReleasedAt: null,
    createdAt: new Date(),
    createdBy: SEED_AUTHOR,
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
  await tests.insertOne(doc);
  console.log(`  ✓ created test ${TEST_ID}`);
}

/**
 * Adds the 4 coding questions to the test if it has none yet.
 */
async function ensureQuestions(
  questionService: QuestionService,
): Promise<void> {
  const existing = await questionService.listQuestions(TEST_ID);
  if (existing.length > 0) {
    console.log(`  • test ${TEST_ID} already has ${existing.length} questions`);
    return;
  }
  for (const q of QUESTIONS) {
    await questionService.addQuestion(TEST_ID, {
      type: "free_text",
      title: q.title,
      content: q.content,
      createdBy: SEED_AUTHOR,
      weight: q.weight,
    });
  }
  console.log(`  ✓ added ${QUESTIONS.length} questions to test ${TEST_ID}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
