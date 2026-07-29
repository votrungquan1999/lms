/**
 * Bun script: Seed a sandbox course + tests + students in every interesting
 * state so an admin can click through the grading hub (and a student can be
 * impersonated via the auth user id) without manually constructing fixtures.
 *
 * Usage:
 *   bun scripts/seed-test-states.ts
 *
 * Reads MONGODB_URI from env (Bun auto-loads .env.local) and defaults to
 * mongodb://localhost:27017/lms.
 *
 * The script is IDEMPOTENT — course, test, question, and student rows are
 * keyed on well-known string ids and re-running the script is a no-op for
 * already-seeded rows. State seeding (answers / grades / submissions / redo)
 * is upsert-safe at the service layer. Drop the local database (or the
 * relevant collections) if you want a clean re-seed.
 */

import { type Db, MongoClient } from "mongodb";
import {
  AI_GRADER_ID,
  AI_MODEL_NAME,
  type AiGradeSuggestionDocument,
} from "../src/lib/ai-grade-types";
import { AnswerService } from "../src/lib/answer-service";
import type { CourseDocument } from "../src/lib/course-service";
import { EnrollmentService } from "../src/lib/enrollment-service";
import { GradeService } from "../src/lib/grade-service";
import { GradeVisibilityService } from "../src/lib/grade-visibility-service";
import {
  type MultiSelectQuestion,
  QuestionService,
  type SingleSelectQuestion,
} from "../src/lib/question-service";
import { RedoRequestService } from "../src/lib/redo-request-service";
import { StudentService } from "../src/lib/student-service";
import type { TestDocument } from "../src/lib/test-service";
import { TestService } from "../src/lib/test-service";
import { TestSubmissionService } from "../src/lib/test-submission-service";

const SEED_AUTHOR = "seed-script";

// Stable ids let the script be re-runnable.
const COURSE_ID = "seed-course-fundamentals";
const TEST_VISIBLE_ID = "seed-test-visible";
const TEST_HIDDEN_ID = "seed-test-hidden";

// ── Scenarios ───────────────────────────────────────────────────────────────

type SeedScenario =
  | "not_started"
  | "in_progress"
  | "submitted_all_answered"
  | "submitted_with_blank_freetext"
  | "submitted_with_blank_mc"
  | "graded_all_answered"
  | "graded_with_blank_freetext"
  | "graded_mc_only_freetext_pending"
  | "graded_with_redo_request"
  | "graded_then_resubmitted"
  // ── AI-grading scenarios ──────────────────────────────────────────────
  // All five reach status=Submitted with no human grade on the free-text
  // question — that's the exact precondition for the "Auto-grade with AI"
  // button to appear on the admin grading hub.
  | "ai_ready_terse"
  | "ai_ready_detailed"
  | "ai_ready_wrong"
  | "ai_with_existing_suggestion"
  | "ai_with_stale_suggestion";

interface SeedStudent {
  username: string;
  name: string;
  scenario: SeedScenario;
}

const STUDENTS: SeedStudent[] = [
  { username: "alice", name: "Alice NotStarted", scenario: "not_started" },
  { username: "bob", name: "Bob InProgress", scenario: "in_progress" },
  {
    username: "carol",
    name: "Carol Submitted (all answered)",
    scenario: "submitted_all_answered",
  },
  {
    username: "dan",
    name: "Dan Submitted (blank free-text)",
    scenario: "submitted_with_blank_freetext",
  },
  {
    username: "eve",
    name: "Eve Submitted (blank MC)",
    scenario: "submitted_with_blank_mc",
  },
  {
    username: "frank",
    name: "Frank Graded (all answered)",
    scenario: "graded_all_answered",
  },
  {
    username: "grace",
    name: "Grace Graded (blank free-text, counted as 0)",
    scenario: "graded_with_blank_freetext",
  },
  {
    username: "hank",
    name: "Hank Submitted (MC autograded, free-text pending)",
    scenario: "graded_mc_only_freetext_pending",
  },
  {
    username: "ivy",
    name: "Ivy Graded with active redo request",
    scenario: "graded_with_redo_request",
  },
  {
    username: "jack",
    name: "Jack Graded → redo → resubmitted",
    scenario: "graded_then_resubmitted",
  },
  // ── AI-grading candidates ─────────────────────────────────────────────
  {
    username: "kelly",
    name: "Kelly Submitted (terse free-text, AI-ready)",
    scenario: "ai_ready_terse",
  },
  {
    username: "leo",
    name: "Leo Submitted (detailed free-text, AI-ready)",
    scenario: "ai_ready_detailed",
  },
  {
    username: "mia",
    name: "Mia Submitted (wrong free-text, AI-ready)",
    scenario: "ai_ready_wrong",
  },
  {
    username: "noah",
    name: "Noah Submitted with existing AI suggestion (test Regenerate)",
    scenario: "ai_with_existing_suggestion",
  },
  {
    username: "olive",
    name: "Olive Submitted with STALE AI suggestion (answer resubmitted)",
    scenario: "ai_with_stale_suggestion",
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
    const testService = new TestService(db);
    const questionService = new QuestionService(db);
    const studentService = new StudentService(db);
    const enrollmentService = new EnrollmentService(db);
    const answerService = new AnswerService(db, questionService);

    // Lazy wiring mirrors services-singleton.ts to break the cycle:
    // GradeService → GradeVisibilityService → TestSubmissionService → GradeService.
    let testSubmissionService!: TestSubmissionService;
    const gradeVisibilityService = new GradeVisibilityService(testService, () =>
      Promise.resolve(testSubmissionService),
    );
    const gradeService = new GradeService(
      db,
      questionService,
      answerService,
      gradeVisibilityService,
    );
    testSubmissionService = new TestSubmissionService(db, gradeService);
    const redoRequestService = new RedoRequestService(db, testService);

    // Course.
    await ensureCourse(db);

    // Two tests with opposite visibility settings — questions are identical.
    const testVisible = await ensureTest(db, TEST_VISIBLE_ID, {
      title: "Sandbox: All visibility ON",
      description:
        "Grades and correct answers revealed after submission. Every per-student scenario lives on this test.",
      showCorrectAnswerAfterSubmit: true,
      showGradeAfterSubmit: true,
    });
    await ensureTest(db, TEST_HIDDEN_ID, {
      title: "Sandbox: All visibility OFF",
      description:
        "Grades hidden until per-question release. Use this to verify the visibility gate on the student test page.",
      showCorrectAnswerAfterSubmit: false,
      showGradeAfterSubmit: false,
    });

    await ensureQuestions(questionService, testVisible.id);
    await ensureQuestions(questionService, TEST_HIDDEN_ID);

    const visibleQuestions = await questionService.listQuestions(
      testVisible.id,
    );
    const visibleFreeText = visibleQuestions[0];
    const visibleSingle = visibleQuestions[1] as SingleSelectQuestion;
    const visibleMulti = visibleQuestions[2] as MultiSelectQuestion;

    if (!visibleFreeText || !visibleSingle || !visibleMulti) {
      throw new Error(
        `Expected 3 questions on ${TEST_VISIBLE_ID}, found ${visibleQuestions.length}`,
      );
    }

    for (const seedStudent of STUDENTS) {
      const existing = await studentService.findByUsername(
        seedStudent.username,
      );
      if (existing) {
        // Idempotent path: skip state seeding for already-seeded students.
        // AnswerService and TestSubmissionService both throw on duplicates,
        // so re-applying a scenario to an existing student is unsafe. Drop
        // the student row (or the whole DB) if you need to reseed.
        console.log(
          `  • student ${existing.username} already exists — skipping scenario "${seedStudent.scenario}"`,
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

      await applyScenario({
        scenario: seedStudent.scenario,
        student,
        testId: testVisible.id,
        freeTextQuestionId: visibleFreeText.id,
        singleQuestion: visibleSingle,
        multiQuestion: visibleMulti,
        answerService,
        gradeService,
        testSubmissionService,
        redoRequestService,
        db,
      });
      console.log(
        `    ↳ scenario "${seedStudent.scenario}" applied to ${student.username}`,
      );
    }

    console.log("");
    console.log("Done.");
    console.log("");
    console.log(`Course id:        ${COURSE_ID}`);
    console.log(`Visible test id:  ${testVisible.id}`);
    console.log(`Hidden  test id:  ${TEST_HIDDEN_ID}`);
    console.log("");
    console.log(
      "Open the admin grading hub → Sandbox course → Sandbox: All visibility ON",
    );
    console.log(
      "to see every per-student status. Students are DB-only stubs (no Google",
    );
    console.log("OAuth) — admin-side clicking is the intended use.");
  } finally {
    await client.close();
  }
}

// ── Idempotent course/test/question seeding ─────────────────────────────────
//
// CourseService and TestService both generate UUIDs internally, so we
// bypass them and insert documents with stable ids directly. Reads still go
// through the services so we exercise the same schema the app uses.

/**
 * Inserts the sandbox course with a stable id if it does not exist.
 */
async function ensureCourse(db: Db): Promise<void> {
  const courses = db.collection<CourseDocument>("course");
  const existing = await courses.findOne({ id: COURSE_ID });
  if (existing) {
    console.log(`  • course ${COURSE_ID} already exists`);
    return;
  }
  await courses.insertOne({
    id: COURSE_ID,
    title: "Sandbox: Fundamentals",
    description: "Seed course for clicking through every test state.",
    createdAt: new Date(),
    createdBy: SEED_AUTHOR,
    updatedAt: null,
    updatedBy: null,
  });
  console.log(`  ✓ created course ${COURSE_ID}`);
}

interface EnsureTestInput {
  title: string;
  description: string;
  showCorrectAnswerAfterSubmit: boolean;
  showGradeAfterSubmit: boolean;
}

/**
 * Inserts a test with a stable id (or returns the existing one). Returns the
 * document so callers can read the canonical id back.
 */
async function ensureTest(
  db: Db,
  testId: string,
  input: EnsureTestInput,
): Promise<TestDocument> {
  const tests = db.collection<TestDocument>("test");
  const existing = await tests.findOne({ id: testId, deletedAt: null });
  if (existing) {
    console.log(`  • test ${testId} already exists`);
    return existing;
  }
  const doc: TestDocument = {
    id: testId,
    courseId: COURSE_ID,
    title: input.title,
    description: input.description,
    showCorrectAnswerAfterSubmit: input.showCorrectAnswerAfterSubmit,
    showGradeAfterSubmit: input.showGradeAfterSubmit,
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
  console.log(`  ✓ created test ${testId}`);
  return doc;
}

/**
 * Adds the three sandbox questions (free-text, single_select, multi_select)
 * if the test has none yet. Skips if questions already exist for this test.
 */
async function ensureQuestions(
  questionService: QuestionService,
  testId: string,
): Promise<void> {
  const existing = await questionService.listQuestions(testId);
  if (existing.length > 0) {
    console.log(`  • test ${testId} already has ${existing.length} questions`);
    return;
  }
  await questionService.addQuestion(testId, {
    type: "free_text",
    title: "Q1: Explain Big-O notation",
    content: "Write 2-3 sentences explaining what O(n) means.",
    createdBy: SEED_AUTHOR,
    weight: 10,
  });
  await questionService.addQuestion(testId, {
    type: "single_select",
    title: "Q2: Which is the time complexity of binary search?",
    content: "Pick one.",
    createdBy: SEED_AUTHOR,
    weight: 5,
    options: [
      { text: "O(1)", isCorrect: false },
      { text: "O(log n)", isCorrect: true },
      { text: "O(n)", isCorrect: false },
      { text: "O(n log n)", isCorrect: false },
    ],
  });
  await questionService.addQuestion(testId, {
    type: "multi_select",
    title: "Q3: Which data structures use O(1) lookups (amortized)?",
    content: "Pick all that apply.",
    createdBy: SEED_AUTHOR,
    weight: 5,
    mcGradingStrategy: "all_or_nothing",
    options: [
      { text: "Hash map", isCorrect: true },
      { text: "Array (by index)", isCorrect: true },
      { text: "Linked list", isCorrect: false },
      { text: "Binary search tree", isCorrect: false },
    ],
  });
  console.log(`  ✓ added 3 questions to test ${testId}`);
}

// ── Per-student scenario state machine ──────────────────────────────────────

interface ScenarioInput {
  scenario: SeedScenario;
  student: { id: string; username: string };
  testId: string;
  freeTextQuestionId: string;
  singleQuestion: SingleSelectQuestion;
  multiQuestion: MultiSelectQuestion;
  answerService: AnswerService;
  gradeService: GradeService;
  testSubmissionService: TestSubmissionService;
  redoRequestService: RedoRequestService;
  /** Direct DB handle — needed to seed `ai_grade` docs without calling Gemini. */
  db: Db;
}

/**
 * Applies the per-scenario state machine for a single student against the
 * "all visibility ON" sandbox test. All underlying operations are upsert-safe
 * so re-running the seed against an already-seeded student is a no-op.
 */
async function applyScenario(input: ScenarioInput): Promise<void> {
  const {
    scenario,
    student,
    testId,
    freeTextQuestionId,
    singleQuestion,
    multiQuestion,
    answerService,
    gradeService,
    testSubmissionService,
    redoRequestService,
  } = input;

  const correctSingleOptionId = singleQuestion.options.find(
    (o) => o.isCorrect,
  )?.id;
  if (!correctSingleOptionId) {
    throw new Error("Sandbox single_select question has no correct option");
  }
  const correctMultiOptionIds = multiQuestion.options
    .filter((o) => o.isCorrect)
    .map((o) => o.id);

  const answerFreeText = () =>
    answerService.submitAnswer({
      testId,
      questionId: freeTextQuestionId,
      studentId: student.id,
      answer: { type: "free_text", text: "My free-text answer" },
    });
  const answerSingle = () =>
    answerService.submitAnswer({
      testId,
      questionId: singleQuestion.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [correctSingleOptionId] },
    });
  const answerMulti = () =>
    answerService.submitAnswer({
      testId,
      questionId: multiQuestion.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: correctMultiOptionIds },
    });
  const answerAll = async () => {
    await answerFreeText();
    await answerSingle();
    await answerMulti();
  };

  switch (scenario) {
    case "not_started":
      return;

    case "in_progress":
      await answerFreeText();
      return;

    case "submitted_all_answered":
      await answerAll();
      await testSubmissionService.submitTest(testId, student.id);
      return;

    case "submitted_with_blank_freetext":
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      return;

    case "submitted_with_blank_mc":
      await answerFreeText();
      await answerSingle();
      // multi_select left blank.
      await testSubmissionService.submitTest(testId, student.id);
      return;

    case "graded_all_answered":
      await answerAll();
      await testSubmissionService.submitTest(testId, student.id);
      await gradeService.gradeQuestion({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        score: 85,
        feedback: "Good explanation but missed the asymptotic bound nuance.",
        gradedBy: SEED_AUTHOR,
      });
      // MC grades created by submitTest's autograde path.
      return;

    case "graded_with_blank_freetext":
      // Free-text deliberately omitted; both MC answered.
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      // No further grade step — after the recent bug fix, status reaches
      // Graded because every *answered* question has a grade row (MC
      // autograded on submit), and the blank free-text scores 0.
      return;

    case "graded_mc_only_freetext_pending":
      await answerAll();
      await testSubmissionService.submitTest(testId, student.id);
      // Intentionally do NOT grade the free-text. MC was autograded, so the
      // student lands at Submitted (atomic-reveal in-flight).
      return;

    case "graded_with_redo_request":
      await answerAll();
      await testSubmissionService.submitTest(testId, student.id);
      await gradeService.gradeQuestion({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        score: 40,
        feedback: "Please re-read the chapter and resubmit.",
        gradedBy: SEED_AUTHOR,
      });
      await redoRequestService.requestRedo(testId, student.id, SEED_AUTHOR);
      return;

    case "graded_then_resubmitted":
      // Round 1.
      await answerAll();
      await testSubmissionService.submitTest(testId, student.id);
      await gradeService.gradeQuestion({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        score: 50,
        feedback: "Try again.",
        gradedBy: SEED_AUTHOR,
      });
      // Open redo → student writes a new free-text → resubmits → redo
      // resolved → teacher grades the new round.
      await redoRequestService.requestRedo(testId, student.id, SEED_AUTHOR);
      await testSubmissionService.deleteSubmission(testId, student.id);
      await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: {
          type: "free_text",
          text: "Second attempt — much better answer.",
        },
      });
      await testSubmissionService.submitTest(testId, student.id);
      await redoRequestService.resolveRedoRequest(testId, student.id);
      await gradeService.gradeQuestion({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        score: 95,
        feedback: "Excellent improvement.",
        gradedBy: SEED_AUTHOR,
      });
      return;

    case "ai_ready_terse": {
      await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: { type: "free_text", text: "O(n) means linear time." },
      });
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      return;
    }

    case "ai_ready_detailed": {
      await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: {
          type: "free_text",
          text:
            "O(n) describes algorithms whose running time grows linearly with " +
            "the input size n. If the input doubles, the work roughly doubles. " +
            "It is an upper-bound asymptotic notation, so it captures the " +
            "worst-case growth rate while ignoring constants and lower-order " +
            "terms.",
        },
      });
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      return;
    }

    case "ai_ready_wrong": {
      await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: {
          type: "free_text",
          text: "O(n) is the fastest possible algorithm. It means constant time and never depends on input size.",
        },
      });
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      return;
    }

    case "ai_with_existing_suggestion": {
      // Submit a free-text answer + MC, submit the test, then pre-seed ONE
      // AI suggestion against that answer. The admin grading hub should
      // show the "Regenerate with AI" button (not "Auto-grade with AI")
      // because a suggestion already exists for this submission.
      const answer = await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: {
          type: "free_text",
          text: "O(n) means the runtime scales linearly with the input.",
        },
      });
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      await insertAiSuggestion(input.db, {
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        gradedAgainstAnswerId: answer.id,
        score: 70,
        feedback:
          "Correct intuition but missing the formal definition (upper-bound, asymptotic, ignores constants). Add a sentence on worst-case behavior to reach full credit.",
        solution:
          "O(n) means the runtime scales linearly with the input. Formally, it is an asymptotic upper bound: as n grows, the runtime grows in direct proportion to n, ignoring constant factors and lower-order terms. In the worst case, the algorithm performs at most c * n operations for some constant c.",
        regenerateReason: null,
      });
      return;
    }

    case "ai_with_stale_suggestion": {
      // Round 1: submit free-text + MC, submit test, seed AI suggestion
      // against round-1 answer. Then resubmit a NEW free-text answer — the
      // suggestion is now stale (gradedAgainstAnswerId points at the old
      // answer revision). Admin grading hub should show the "Stale" badge.
      const round1Answer = await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: {
          type: "free_text",
          text: "O(n) is linear time.",
        },
      });
      await answerSingle();
      await answerMulti();
      await testSubmissionService.submitTest(testId, student.id);
      await insertAiSuggestion(input.db, {
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        gradedAgainstAnswerId: round1Answer.id,
        score: 55,
        feedback:
          "Too terse. Expand on what 'linear' means and why constants don't matter.",
        solution:
          "O(n) is linear time. It is an asymptotic upper bound describing how the runtime grows as the input size n increases — in this case, in direct proportion to n. Constant factors and lower-order terms are dropped because they become negligible for large n.",
        regenerateReason: null,
      });
      // Student takes the feedback and resubmits a stronger answer.
      await answerService.submitAnswer({
        testId,
        questionId: freeTextQuestionId,
        studentId: student.id,
        answer: {
          type: "free_text",
          text:
            "O(n) is linear time: the runtime grows in direct proportion to " +
            "input size n. The notation is an asymptotic upper bound, so " +
            "constant factors and lower-order terms are dropped.",
        },
      });
      // No re-submit of the test marker is needed — the test is already
      // submitted. The new latest answer makes the existing suggestion
      // stale (gradedAgainstAnswerId points at the older round-1 row).
      return;
    }

    default: {
      const _exhaustive: never = scenario;
      throw new Error(`Unknown scenario: ${_exhaustive}`);
    }
  }
}

interface InsertAiSuggestionInput {
  testId: string;
  questionId: string;
  studentId: string;
  gradedAgainstAnswerId: string;
  score: number;
  feedback: string;
  solution: string;
  regenerateReason: string | null;
}

/**
 * Inserts an `ai_grade` document directly. Bypasses AiGradeService so we
 * don't have to call the real Gemini API during seeding. The shape matches
 * AiGradeService.generateForStudent exactly, including the `gradedBy` audit
 * string and the `appliedAt: null` (unapplied) state — that's what the
 * admin UI surfaces as a draft suggestion with an Apply button.
 */
async function insertAiSuggestion(
  db: Db,
  input: InsertAiSuggestionInput,
): Promise<void> {
  const doc: AiGradeSuggestionDocument = {
    id: crypto.randomUUID(),
    testId: input.testId,
    questionId: input.questionId,
    studentId: input.studentId,
    score: input.score,
    feedback: input.feedback,
    solution: input.solution,
    gradedAgainstAnswerId: input.gradedAgainstAnswerId,
    model: AI_MODEL_NAME,
    gradedBy: AI_GRADER_ID,
    generatedByAdminId: SEED_AUTHOR,
    generatedAt: new Date(),
    regenerateReason: input.regenerateReason,
    appliedAt: null,
    appliedBy: null,
  };
  await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne(doc);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
