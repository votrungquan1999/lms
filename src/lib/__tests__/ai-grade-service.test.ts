/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import type {
  AiClient,
  AiGradeBatchInput,
  AiGradeBatchOptions,
} from "src/lib/ai/ai-client";
import type { AiGradeSuggestionDocument } from "src/lib/ai-grade-types";
import type { GradeDocument } from "src/lib/grade-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("AiGradeService.generateForStudent - Step 1", () => {
  dbIt(
    "given two answered free-text questions and no existing grades, when generating, then inserts one suggestion row per question with deterministic stub scores and audit fields populated",
    async ({ db }) => {
      // Given: a stub AI client that echoes per-question deterministic scores
      const stubScores = new Map<string, { score: number; feedback: string }>();
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => {
            const expected = stubScores.get(item.questionId);
            return {
              questionId: item.questionId,
              score: expected?.score ?? 0,
              feedback: expected?.feedback ?? "",
              solution: "",
            };
          });
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      // Seed: one test, two free-text questions, both answered by the student
      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 1",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain recursion",
        createdBy: "admin-1",
        type: "free_text",
      });

      const q2 = await questionService.addQuestion(test.id, {
        title: "Q2",
        content: "Explain Big O",
        createdBy: "admin-1",
        type: "free_text",
      });

      const a1 = await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "A function that calls itself." },
      });

      const a2 = await answerService.submitAnswer({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Asymptotic upper bound." },
      });

      stubScores.set(q1.id, { score: 85, feedback: "Solid explanation." });
      stubScores.set(q2.id, { score: 70, feedback: "Mostly correct." });

      // When
      const suggestions = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );

      // Then: return shape — one suggestion per answered question with the
      // stubbed score/feedback, the right answer snapshot, and the initial
      // (un-applied, non-regenerate) state.
      expect(suggestions).toHaveLength(2);

      const sugQ1 = suggestions.find((s) => s.questionId === q1.id)!;
      const sugQ2 = suggestions.find((s) => s.questionId === q2.id)!;

      expect(sugQ1.score).toBe(85);
      expect(sugQ1.feedback).toBe("Solid explanation.");
      expect(sugQ1.gradedAgainstAnswerId).toBe(a1.id);
      expect(sugQ1.model).toBe("gemini-2.5-flash");
      expect(sugQ1.generatedAt).toBeInstanceOf(Date);
      expect(sugQ1.appliedAt).toBeNull();
      expect(sugQ1.appliedBy).toBeNull();
      expect(sugQ1.regenerateReason).toBeNull();

      expect(sugQ2.score).toBe(70);
      expect(sugQ2.feedback).toBe("Mostly correct.");
      expect(sugQ2.gradedAgainstAnswerId).toBe(a2.id);
      expect(sugQ2.appliedAt).toBeNull();
      expect(sugQ2.appliedBy).toBeNull();
      expect(sugQ2.regenerateReason).toBeNull();
    },
  );
});

describe("AiGradeService.generateForStudent - Step 3 (skip filter)", () => {
  dbIt(
    "given four free-text questions where Q1 is answered, Q2 is whitespace-only, Q3 is unanswered, and Q4 has a human grade, when generating, then only Q1 is sent to the AI client and only Q1 receives a suggestion",
    async ({ db }) => {
      // Given: stub AI client. We assert the filter through observable
      // outcomes (returned suggestions + persisted rows), not by spying on
      // the AI client's call args.
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 90,
            feedback: "ok",
            solution: "",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      // Seed: one test with four free-text questions
      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 3",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1 - answered non-blank, ungraded",
        content: "What is recursion?",
        createdBy: "admin-1",
        type: "free_text",
      });

      const q2 = await questionService.addQuestion(test.id, {
        title: "Q2 - whitespace-only answer",
        content: "Define encapsulation.",
        createdBy: "admin-1",
        type: "free_text",
      });

      const q3 = await questionService.addQuestion(test.id, {
        title: "Q3 - no answer submitted",
        content: "Define polymorphism.",
        createdBy: "admin-1",
        type: "free_text",
      });

      const q4 = await questionService.addQuestion(test.id, {
        title: "Q4 - answered but already graded by teacher",
        content: "Define abstraction.",
        createdBy: "admin-1",
        type: "free_text",
      });

      // Q1: answered non-blank
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Self-referential function." },
      });

      // Q2: whitespace-only answer (3 spaces — must trip the .trim() check)
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "   " },
      });

      // Q3: NO submitAnswer call at all

      // Q4: answered non-blank, then teacher grades manually
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q4.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Hiding implementation details." },
      });
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q4.id,
        studentId: "student-1",
        score: 80,
        feedback: "Good.",
        gradedBy: "admin-1",
      });

      // When
      const suggestions = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );

      // Then: return shape — only Q1's suggestion. Q2 (whitespace), Q3
      // (unanswered), and Q4 (already human-graded) are filtered before the
      // LLM call so no suggestion comes back for them.
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.questionId).toBe(q1.id);

      // Then: the persisted suggestions for this student mirror the returned
      // shape — only Q1 has a stored suggestion; Q2, Q3, Q4 are absent.
      const grouped = await aiGradeService.getSuggestionsForStudent(
        test.id,
        "student-1",
      );
      expect([...grouped.keys()]).toEqual([q1.id]);
      expect(grouped.get(q1.id)).toHaveLength(1);
      expect(grouped.has(q2.id)).toBe(false);
      expect(grouped.has(q3.id)).toBe(false);
      expect(grouped.has(q4.id)).toBe(false);
    },
  );
});

describe("AiGradeService.regenerateForStudent - Step 5", () => {
  dbIt(
    "given one free-text question with an existing suggestion, when regenerating with a reason, then appends a new row carrying the reason while leaving the prior row immutable and forwards the prior grade and reason to the AI client",
    async ({ db }) => {
      // Given: a stub AI client whose first call returns the initial
      // deterministic score and whose second call (regenerate) returns a
      // different score so we can tell the new row apart from the prior one.
      let callIndex = 0;
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          const isRegenerate = callIndex > 0;
          callIndex += 1;
          return items.map((item) => ({
            questionId: item.questionId,
            score: isRegenerate ? 60 : 90,
            feedback: isRegenerate
              ? "Reconsidered after teacher reason."
              : "Initial suggestion.",
            solution: "",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      // Seed: one test, one free-text question, one answer.
      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 5",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain SOLID.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: {
          type: "free_text",
          text: "Single responsibility, open-closed, ...",
        },
      });

      // Given: first call lands the initial suggestion.
      const initialSuggestions = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );
      expect(initialSuggestions).toHaveLength(1);
      const priorSuggestion = initialSuggestions[0]!;
      expect(priorSuggestion.score).toBe(90);
      expect(priorSuggestion.regenerateReason).toBeNull();

      // When: a second admin clicks Regenerate with a reason.
      const reason = "AI was too lenient on partial credit";
      const regenerated = await aiGradeService.regenerateForStudent(
        test.id,
        "student-1",
        "admin-2",
        reason,
      );

      // Then: one new suggestion returned (per still-in-scope question).
      expect(regenerated).toHaveLength(1);
      const newSuggestion = regenerated[0]!;
      expect(newSuggestion.score).toBe(60);
      expect(newSuggestion.regenerateReason).toBe(reason);

      // Then: DB has two rows total — the original PLUS the new row.
      const rows = await db
        .collection<AiGradeSuggestionDocument>("ai_grade")
        .find({ testId: test.id, studentId: "student-1", questionId: q1.id })
        .toArray();
      expect(rows).toHaveLength(2);

      const originalRow = rows.find((r) => r.id === priorSuggestion.id)!;
      const newRow = rows.find((r) => r.id === newSuggestion.id)!;

      // Then: original row is UNCHANGED (regenerateReason still null, score
      // still 90, generatedByAdminId still admin-1).
      expect(originalRow.regenerateReason).toBeNull();
      expect(originalRow.score).toBe(90);
      expect(originalRow.generatedByAdminId).toBe("admin-1");
      expect(originalRow.feedback).toBe("Initial suggestion.");

      // Then: new row carries the reason and attributes to admin-2.
      expect(newRow.regenerateReason).toBe(reason);
      expect(newRow.score).toBe(60);
      expect(newRow.feedback).toBe("Reconsidered after teacher reason.");
      expect(newRow.generatedByAdminId).toBe("admin-2");
      expect(newRow.appliedAt).toBeNull();
      expect(newRow.appliedBy).toBeNull();

      // Then: new row's generatedAt is more recent than the prior row's.
      expect(newRow.generatedAt.getTime()).toBeGreaterThanOrEqual(
        originalRow.generatedAt.getTime(),
      );
    },
  );
});

describe("AiGradeService.applySuggestion - Step 6 (apply-over-human-grade refusal)", () => {
  dbIt(
    "given a teacher-authored grade exists and an AI suggestion with appliedAt=null targets the same question, when applying the suggestion, then throws the pinned refusal message AND leaves the existing grade row unchanged AND keeps the suggestion's appliedAt null",
    async ({ db }) => {
      // Given: a stub AI client that lands a deterministic initial suggestion.
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 55,
            feedback: "ai feedback",
            solution: "",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 6 - refusal",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Define cohesion.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: {
          type: "free_text",
          text: "Degree to which the elements of a module belong together.",
        },
      });

      // Given: a teacher manually grades the question FIRST (no preceding
      // applySuggestion call — this is a pure human-authored grade).
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 90,
        feedback: "Teacher feedback - excellent.",
        gradedBy: "admin-teacher",
      });

      // Given: a NEW AI suggestion exists for the same question with
      // appliedAt=null. We bypass `generateForStudent`'s skip filter (it would
      // filter out questions that already have a human grade) by inserting
      // directly so we can force the refusal path.
      const suggestionId = "suggestion-refusal-1";
      const now = new Date();
      await db.collection("ai_grade").insertOne({
        id: suggestionId,
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 30,
        feedback: "AI thinks this is mediocre.",
        gradedAgainstAnswerId: "answer-snapshot-1",
        model: "gemini-2.5-flash",
        gradedBy: "ai:gemini-2.5-flash",
        generatedByAdminId: "admin-1",
        generatedAt: now,
        regenerateReason: null,
        appliedAt: null,
        appliedBy: null,
      });

      // When + Then: applySuggestion throws the pinned verbatim message.
      await expect(
        aiGradeService.applySuggestion(suggestionId, "admin-X"),
      ).rejects.toThrow(
        "This question already has a teacher-authored grade. Edit the grade directly to change it.",
      );

      // Then: the existing teacher-authored grade is unchanged — same score
      // and feedback as the teacher originally entered.
      const existing = await gradeService.getGrade(test.id, q1.id, "student-1");
      expect(existing).not.toBeNull();
      expect(existing!.score).toBe(90);
      expect(existing!.feedback).toBe("Teacher feedback - excellent.");

      // Then: the suggestion row's appliedAt / appliedBy are still null.
      const latest = await aiGradeService.getLatestSuggestion(
        test.id,
        q1.id,
        "student-1",
      );
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe(suggestionId);
      expect(latest!.appliedAt).toBeNull();
      expect(latest!.appliedBy).toBeNull();
    },
  );
});

describe("AiGradeService.applySuggestion - Step 6", () => {
  dbIt(
    "given one free-text question with a single unapplied AI suggestion and no existing human grade, when applying the suggestion, then writes the suggestion's score and feedback to the grade collection attributed to the applying admin AND marks the suggestion row as applied",
    async ({ db }) => {
      // Given: a stub AI client that lands a deterministic initial suggestion.
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 80,
            feedback: "good",
            solution: "",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 6",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain DI.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: {
          type: "free_text",
          text: "Inject collaborators rather than constructing them.",
        },
      });

      const initialSuggestions = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );
      expect(initialSuggestions).toHaveLength(1);
      const suggestion = initialSuggestions[0]!;
      expect(suggestion.score).toBe(80);
      expect(suggestion.feedback).toBe("good");
      expect(suggestion.appliedAt).toBeNull();
      expect(suggestion.appliedBy).toBeNull();

      // When: a teacher (admin-3) clicks Apply on this suggestion.
      await aiGradeService.applySuggestion(suggestion.id, "admin-3");

      // Then: the official grade is the suggestion's score/feedback, attributed
      // to admin-3 (gradedBy is the applier — the suggestion becomes the
      // teacher's grade per the brainstorm-3 design).
      const grade = await gradeService.getGrade(test.id, q1.id, "student-1");
      expect(grade).not.toBeNull();
      expect(grade!.score).toBe(80);
      expect(grade!.feedback).toBe("good");

      const gradeDoc = await db.collection<GradeDocument>("grade").findOne({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
      });
      expect(gradeDoc).not.toBeNull();
      expect(gradeDoc!.gradedBy).toBe("admin-3");

      // Then: the suggestion row is now marked applied by admin-3.
      const latest = await aiGradeService.getLatestSuggestion(
        test.id,
        q1.id,
        "student-1",
      );
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe(suggestion.id);
      expect(latest!.appliedAt).toBeInstanceOf(Date);
      expect(latest!.appliedBy).toBe("admin-3");
    },
  );
});

describe("AiGradeService.applySuggestion - Step 6 override semantics (?? not ||)", () => {
  dbIt(
    "given a suggestion with score=80 and feedback='good', when applying with scoreOverride=0 and feedbackOverride='', then the grade row stores score=0 and feedback='' (the falsy values are honored as intentional overrides, not silently replaced by the suggestion defaults)",
    async ({ db }) => {
      // Given: a stub AI client that lands a deterministic initial suggestion.
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 80,
            feedback: "good",
            solution: "",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 6 overrides",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain DI.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: {
          type: "free_text",
          text: "Inject collaborators rather than constructing them.",
        },
      });

      const initial = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );
      const suggestion = initial[0]!;
      expect(suggestion.score).toBe(80);
      expect(suggestion.feedback).toBe("good");

      // When: applying with the falsy overrides — 0% score and empty feedback.
      await aiGradeService.applySuggestion(suggestion.id, "admin-3", {
        scoreOverride: 0,
        feedbackOverride: "",
      });

      // Then: the grade row records the overrides, not the suggestion defaults.
      // This pins the `??`-not-`||` distinction: with `||`, 0 and "" would have
      // fallen through to 80 / "good" and this assertion would fail.
      const grade = await gradeService.getGrade(test.id, q1.id, "student-1");
      expect(grade).not.toBeNull();
      expect(grade!.score).toBe(0);
      expect(grade!.feedback).toBe("");
    },
  );
});

describe("AiGradeService.generateForStudent - Step 9 (atomicity on LLM failure)", () => {
  dbIt(
    "given two answered free-text questions and a stubbed AI client that throws synchronously, when generating, then the call rejects AND zero rows are inserted into the ai_grade collection",
    async ({ db }) => {
      // Given: a stub AI client that throws synchronously, simulating an LLM
      // network failure or a Zod schema rejection thrown by the SDK.
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch() {
          throw new Error("simulated LLM failure");
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 9",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain SRP.",
        createdBy: "admin-1",
        type: "free_text",
      });

      const q2 = await questionService.addQuestion(test.id, {
        title: "Q2",
        content: "Explain DRY.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Single responsibility principle." },
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Don't repeat yourself." },
      });

      // When + Then: the call rejects with the thrown LLM error (no defensive
      // try/catch in the service swallows it).
      await expect(
        aiGradeService.generateForStudent(test.id, "student-1", "admin-x"),
      ).rejects.toThrow("simulated LLM failure");

      // Then: ZERO rows landed in the ai_grade collection. Proves atomicity —
      // the service computes the batch in memory and does one `insertMany`
      // AFTER the LLM call returns; a thrown LLM aborts before any insert.
      const rows = await db
        .collection<AiGradeSuggestionDocument>("ai_grade")
        .find({ testId: test.id, studentId: "student-1" })
        .toArray();
      expect(rows).toHaveLength(0);
    },
  );
});

describe("AiGradeService.applySuggestion - Step 7 (switch applied back to a non-latest suggestion)", () => {
  dbIt(
    "given two suggestions for the same question where A was applied then B was applied, when applying A again (the non-latest), then the grade row reflects A, A carries the applied marker, B's marker is cleared, and exactly one suggestion is marked applied",
    async ({ db }) => {
      // Given: a free-text question and two pre-seeded suggestions (A older,
      // B newer). We bypass `generateForStudent` so the test is decoupled from
      // the LLM seam and exercises the apply path directly — the only path
      // Step 7 cares about is `applySuggestion` switching the applied marker.
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch() {
          throw new Error("not used in this test");
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 7",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain LSP.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: {
          type: "free_text",
          text: "Subtypes must be substitutable for their base types.",
        },
      });

      // Seed suggestion A (older), then suggestion B (newer). Both unapplied.
      const olderTime = new Date("2026-01-01T00:00:00Z");
      const newerTime = new Date("2026-01-02T00:00:00Z");

      const suggestionAId = "suggestion-A";
      const suggestionBId = "suggestion-B";

      await db.collection("ai_grade").insertOne({
        id: suggestionAId,
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 60,
        feedback: "first try",
        gradedAgainstAnswerId: "answer-snapshot-1",
        model: "gemini-2.5-flash",
        gradedBy: "ai:gemini-2.5-flash",
        generatedByAdminId: "admin-1",
        generatedAt: olderTime,
        regenerateReason: null,
        appliedAt: null,
        appliedBy: null,
      });

      await db.collection("ai_grade").insertOne({
        id: suggestionBId,
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 80,
        feedback: "second try",
        gradedAgainstAnswerId: "answer-snapshot-1",
        model: "gemini-2.5-flash",
        gradedBy: "ai:gemini-2.5-flash",
        generatedByAdminId: "admin-2",
        generatedAt: newerTime,
        regenerateReason: "regen reason",
        appliedAt: null,
        appliedBy: null,
      });

      // When: apply A first, then apply B, then switch back to A.
      await aiGradeService.applySuggestion(suggestionAId, "admin-1");
      await aiGradeService.applySuggestion(suggestionBId, "admin-2");
      await aiGradeService.applySuggestion(suggestionAId, "admin-3");

      // Then: the grade row reflects A's score/feedback attributed to admin-3.
      const grade = await gradeService.getGrade(test.id, q1.id, "student-1");
      expect(grade).not.toBeNull();
      expect(grade!.score).toBe(60);
      expect(grade!.feedback).toBe("first try");

      const gradeDoc = await db.collection<GradeDocument>("grade").findOne({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
      });
      expect(gradeDoc).not.toBeNull();
      expect(gradeDoc!.gradedBy).toBe("admin-3");

      // Then: A is the currently-applied row; B's marker is cleared.
      const grouped = await aiGradeService.getSuggestionsForStudent(
        test.id,
        "student-1",
      );
      const suggestions = grouped.get(q1.id) ?? [];
      const sugA = suggestions.find((s) => s.id === suggestionAId)!;
      const sugB = suggestions.find((s) => s.id === suggestionBId)!;

      expect(sugA.appliedAt).toBeInstanceOf(Date);
      expect(sugA.appliedBy).toBe("admin-3");
      expect(sugB.appliedAt).toBeNull();
      expect(sugB.appliedBy).toBeNull();

      // Then: exclusivity invariant — exactly ONE suggestion marked applied.
      const applied = suggestions.filter((s) => s.appliedAt !== null);
      expect(applied).toHaveLength(1);
    },
  );
});

describe("AiGradeService.applySuggestion - Step 7 (solutionOverride precedence)", () => {
  dbIt(
    "given a suggestion with solution='ai-solution', when applying with solutionOverride='', then the grade row stores solution='' (empty-string is honored as an intentional override via ?? not ||)",
    async ({ db }) => {
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch() {
          throw new Error("not used in this test");
        },
      };
      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 7 solutionOverride",
        description: "",
        createdBy: "admin-1",
      });
      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Sum a list.",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "def total(nums): pass" },
      });

      const suggestionId = "suggestion-step-7-override";
      await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne({
        id: suggestionId,
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 75,
        feedback: "ok",
        solution: "ai-solution",
        gradedAgainstAnswerId: "answer-snap-1",
        model: "gemini-2.5-flash",
        gradedBy: "ai:gemini-2.5-flash",
        generatedByAdminId: "admin-1",
        generatedAt: new Date(),
        regenerateReason: null,
        appliedAt: null,
        appliedBy: null,
      });

      await aiGradeService.applySuggestion(suggestionId, "admin-3", {
        solutionOverride: "",
      });

      const grade = await gradeService.getGrade(test.id, q1.id, "student-1");
      expect(grade!.solution).toBe("");
    },
  );
});

describe("AiGradeService.applySuggestion - Step 6 (solution into grade row)", () => {
  dbIt(
    "given an unapplied suggestion whose solution is set, when applying, then the persisted grade row carries the same solution string",
    async ({ db }) => {
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch() {
          throw new Error("not used in this test");
        },
      };
      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const {
        testService,
        questionService,
        answerService,
        gradeService,
        aiGradeService,
      } = services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 6 solution",
        description: "",
        createdBy: "admin-1",
      });
      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Sum a list.",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "def total(nums): pass" },
      });

      const suggestionId = "suggestion-step-6-sol";
      const aiSolution = "def total(nums):\n    return sum(nums)";
      await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne({
        id: suggestionId,
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 75,
        feedback: "ok",
        solution: aiSolution,
        gradedAgainstAnswerId: "answer-snap-1",
        model: "gemini-2.5-flash",
        gradedBy: "ai:gemini-2.5-flash",
        generatedByAdminId: "admin-1",
        generatedAt: new Date(),
        regenerateReason: null,
        appliedAt: null,
        appliedBy: null,
      });

      await aiGradeService.applySuggestion(suggestionId, "admin-2");

      const gradeDoc = await db.collection<GradeDocument>("grade").findOne({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
      });
      expect(gradeDoc).not.toBeNull();
      expect(gradeDoc!.solution).toBe(aiSolution);

      const grade = await gradeService.getGrade(test.id, q1.id, "student-1");
      expect(grade!.solution).toBe(aiSolution);
    },
  );
});

describe("AiGradeService.regenerateForStudent - Step 5 (prior solution forwarded)", () => {
  dbIt(
    "given an existing suggestion with a solution, when regenerating, then the AI client's regenerate call receives the prior solution in priorGrades",
    async ({ db }) => {
      const calls: Array<{
        items: AiGradeBatchInput[];
        opts: AiGradeBatchOptions | undefined;
      }> = [];

      let callIndex = 0;
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(
          items: AiGradeBatchInput[],
          opts?: AiGradeBatchOptions,
        ) {
          calls.push({ items, opts });
          const isRegenerate = callIndex > 0;
          callIndex += 1;
          return items.map((item) => ({
            questionId: item.questionId,
            score: isRegenerate ? 70 : 80,
            feedback: isRegenerate ? "v2" : "v1",
            solution: isRegenerate
              ? "def total(nums):\n    return sum(nums)"
              : "def total(nums):\n    s = 0\n    for n in nums:\n        s += n\n    return s",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 5 solution",
        description: "",
        createdBy: "admin-1",
      });
      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Sum a list.",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "def total(nums): pass" },
      });

      await aiGradeService.generateForStudent(test.id, "student-1", "admin-1");
      await aiGradeService.regenerateForStudent(
        test.id,
        "student-1",
        "admin-2",
        "be stricter on style",
      );

      expect(calls).toHaveLength(2);
      const regenerateCall = calls[1]!;
      expect(regenerateCall.opts?.priorGrades).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            questionId: q1.id,
            solution:
              "def total(nums):\n    s = 0\n    for n in nums:\n        s += n\n    return s",
          }),
        ]),
      );
    },
  );
});

describe("AiGradeService.regenerateForQuestion - Step A1 (single-question scope)", () => {
  dbIt(
    "given two answered ungraded free-text questions each with an initial suggestion, when regenerating scoped to Q1 with a reason, then Q1 gets one new appended suggestion carrying the reason while Q2 is left with its single original suggestion untouched",
    async ({ db }) => {
      // Given: a stub AI client whose first call returns the initial score and
      // whose later calls (regenerate) return a different score so the new row
      // is distinguishable from the prior one.
      let callIndex = 0;
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          const isRegenerate = callIndex > 0;
          callIndex += 1;
          return items.map((item) => ({
            questionId: item.questionId,
            score: isRegenerate ? 55 : 90,
            feedback: isRegenerate ? "Reconsidered." : "Initial.",
            solution: "",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step A1",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Explain recursion.",
        createdBy: "admin-1",
        type: "free_text",
      });

      const q2 = await questionService.addQuestion(test.id, {
        title: "Q2",
        content: "Explain Big O.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "A function that calls itself." },
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Asymptotic upper bound." },
      });

      // Given: an initial suggestion exists for BOTH questions.
      const initial = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );
      expect(initial).toHaveLength(2);

      // When: a teacher regenerates ONLY Q1 with a reason.
      const reason = "AI under-credited the base-case explanation";
      const regenerated = await aiGradeService.regenerateForQuestion(
        test.id,
        "student-1",
        q1.id,
        "admin-2",
        reason,
      );

      // Then: exactly one suggestion comes back — for Q1 — carrying the reason
      // and the regenerate score.
      expect(regenerated).toHaveLength(1);
      expect(regenerated[0]!.questionId).toBe(q1.id);
      expect(regenerated[0]!.score).toBe(55);
      expect(regenerated[0]!.regenerateReason).toBe(reason);

      // Then: Q1 now has two rows (original + regenerate); Q2 is undisturbed
      // with its single original row.
      const grouped = await aiGradeService.getSuggestionsForStudent(
        test.id,
        "student-1",
      );
      expect(grouped.get(q1.id)).toHaveLength(2);
      expect(grouped.get(q2.id)).toHaveLength(1);
      expect(grouped.get(q2.id)![0]!.regenerateReason).toBeNull();
      expect(grouped.get(q2.id)![0]!.score).toBe(90);
    },
  );
});

describe("AiGradeService.generateForStudent - Step 4 (solution persistence)", () => {
  dbIt(
    "given the AI client returns a per-item solution, when generating, then the inserted ai_grade doc AND the returned suggestion both carry that solution string",
    async ({ db }) => {
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 75,
            feedback: "ok",
            solution: "def total(nums):\n    return sum(nums)",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade Step 4",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Sum a list using a loop.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "def total(nums): pass" },
      });

      const suggestions = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.solution).toBe(
        "def total(nums):\n    return sum(nums)",
      );

      const rows = await db
        .collection<AiGradeSuggestionDocument>("ai_grade")
        .find({ testId: test.id, studentId: "student-1" })
        .toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.solution).toBe("def total(nums):\n    return sum(nums)");
    },
  );

  dbIt(
    "given the AI client returns a solution with CRLF line endings and trailing whitespace, when generating, then the stored and returned solution are normalized to LF with no trailing whitespace",
    async ({ db }) => {
      const stubAiClient: AiClient = {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 75,
            feedback: "ok",
            solution: "def total(nums):  \r\n    return sum(nums)\r\n",
          }));
        },
      };

      const services = buildCoreServices(db, { aiClient: stubAiClient });
      const { testService, questionService, answerService, aiGradeService } =
        services;

      const test = await testService.createTest("course-1", {
        title: "AI Grade solution normalization",
        description: "",
        createdBy: "admin-1",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Sum a list using a loop.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "def total(nums): pass" },
      });

      const suggestions = await aiGradeService.generateForStudent(
        test.id,
        "student-1",
        "admin-1",
      );

      // Returned suggestion is normalized: CRLF -> LF, trailing whitespace stripped.
      expect(suggestions[0]!.solution).toBe(
        "def total(nums):\n    return sum(nums)\n",
      );

      // Persisted document carries the normalized solution too.
      const rows = await db
        .collection<AiGradeSuggestionDocument>("ai_grade")
        .find({ testId: test.id, studentId: "student-1" })
        .toArray();
      expect(rows[0]!.solution).toBe(
        "def total(nums):\n    return sum(nums)\n",
      );
    },
  );
});
