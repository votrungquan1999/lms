import type { Db } from "mongodb";
import type { AiClient, AiGradeBatchInput } from "src/lib/ai/ai-client";
import type { AiGradeSuggestionDocument } from "src/lib/ai-grade-types";
import type { AnnotationDocument } from "src/lib/annotation-service";
import type { GradeDocument } from "src/lib/grade-service";
import type { RedoRequestDocument } from "src/lib/redo-request-service";
import type { TestFeedbackDocument } from "src/lib/test-feedback-service";
import type { TestSubmissionDocument } from "src/lib/test-submission-service";
import {
  addTestSchool,
  getTestServices,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The default school's ids every row below aims another school's writes at. */
interface ForeignWork {
  testId: string;
  questionId: string;
  studentId: string;
}

/**
 * Seeds, in the default school, a test with one free-text question and a
 * student who answered and submitted it — the other school's records from
 * School B's point of view.
 */
async function seedForeignWork(): Promise<ForeignWork> {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Foreign Course",
    description: "",
    createdBy: "default-school-admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Foreign Test",
    description: "",
    createdBy: "default-school-admin",
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Explain",
    content: "",
    createdBy: "default-school-admin",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-foreign-student",
    username: "foreign-student",
    name: "Foreign Student",
    createdBy: "default-school-admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "default-school-admin",
  );
  await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "Because." },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  return { testId: test.id, questionId: question.id, studentId: student.id };
}

/**
 * Feature: a school's grading writes only ever land on that school's tests
 * As a school admin working in one school
 * I want the grading services themselves to refuse a test outside my school
 * So that no write path, even one that skips the page's own check, changes another school's grading
 */
describe("Feature: a school's grading writes only ever land on that school's tests", () => {
  let db: Db;
  let schoolBId: string;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
    schoolBId = (await addTestSchool("School B")).id;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("refuses to grade an answer on another school's test, and writes no grade", async () => {
    const { testId, questionId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).gradeService.gradeQuestion({
        testId,
        questionId,
        studentId,
        score: 100,
        feedback: "Injected",
        gradedBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");

    const grades = await db
      .collection<GradeDocument>("grade")
      .countDocuments({ testId });
    expect(grades).toBe(0);
  });

  it("refuses to auto-grade a student's answers on another school's test, and writes no grade", async () => {
    const { testId, studentId } = await seedForeignWork();
    const services = getTestServices();
    const mcQuestion = await services.questionService.addQuestion(testId, {
      title: "Pick one",
      content: "",
      createdBy: "default-school-admin",
      type: "single_select",
      options: [
        { text: "Right", isCorrect: true },
        { text: "Wrong", isCorrect: false },
      ],
    });
    await services.answerService.submitAnswer({
      testId,
      questionId: mcQuestion.id,
      studentId,
      answer: { type: "mc", selectedIds: [mcQuestion.options[0].id] },
    });

    await expect(
      getTestServices(schoolBId).gradeService.autoGradeTest(testId, studentId),
    ).rejects.toThrow("Test not found");

    const grades = await db
      .collection<GradeDocument>("grade")
      .countDocuments({ testId });
    expect(grades).toBe(0);
  });

  it("refuses to save annotations on another school's test, and saves none", async () => {
    const { testId, questionId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).annotationService.saveAnnotations({
        testId,
        questionId,
        studentId,
        gradedBy: "school-b-admin",
        annotations: [{ mediaKey: "photo.png", strokes: [] }],
      }),
    ).rejects.toThrow("Test not found");

    const annotations = await db
      .collection<AnnotationDocument>("annotation")
      .countDocuments({ testId });
    expect(annotations).toBe(0);
  });

  it("refuses to leave test feedback on another school's test, and writes none", async () => {
    const { testId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).testFeedbackService.setTestFeedback({
        testId,
        studentId,
        feedback: "Injected",
        gradedBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");

    const feedback = await db
      .collection<TestFeedbackDocument>("test_feedback")
      .countDocuments({ testId });
    expect(feedback).toBe(0);
  });

  it("refuses to release one student's grades on another school's test, and leaves the submission unreleased", async () => {
    const { testId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).testSubmissionService.releaseGradeToStudent(
        testId,
        studentId,
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    const submission = await db
      .collection<TestSubmissionDocument>("test_submission")
      .findOne({ testId, studentId, deletedAt: null });
    expect(submission?.releasedAt).toBeNull();
  });

  it("refuses to withdraw a student's submission on another school's test, and leaves it active", async () => {
    const { testId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).testSubmissionService.deleteSubmission(
        testId,
        studentId,
      ),
    ).rejects.toThrow("Test not found");

    const active = await db
      .collection<TestSubmissionDocument>("test_submission")
      .countDocuments({ testId, studentId, deletedAt: null });
    expect(active).toBe(1);
  });

  it("refuses to close a redo request on another school's test, and leaves it open", async () => {
    const { testId, studentId } = await seedForeignWork();
    await getTestServices().redoRequestService.requestRedo(
      testId,
      studentId,
      "default-school-admin",
    );

    await expect(
      getTestServices(schoolBId).redoRequestService.resolveRedoRequest(
        testId,
        studentId,
      ),
    ).rejects.toThrow("Test not found");

    const open = await db
      .collection<RedoRequestDocument>("redo_request")
      .countDocuments({ testId, studentId, resolvedAt: null });
    expect(open).toBe(1);
  });

  it("refuses to apply an AI suggestion on another school's test, and marks nothing applied", async () => {
    const { testId, questionId, studentId } = await seedForeignWork();
    await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne({
      id: "foreign-suggestion",
      testId,
      questionId,
      studentId,
      score: 80,
      feedback: "AI feedback",
      gradedAgainstAnswerId: "answer-1",
      model: "test-model",
      gradedBy: "ai",
      generatedByAdminId: "default-school-admin",
      generatedAt: new Date(),
      regenerateReason: null,
      appliedAt: null,
      appliedBy: null,
    });

    await expect(
      getTestServices(schoolBId).aiGradeService.applySuggestion(
        "foreign-suggestion",
        "school-b-admin",
        { testId, studentId },
      ),
    ).rejects.toThrow("Test not found");

    const suggestion = await db
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .findOne({ id: "foreign-suggestion" });
    expect(suggestion?.appliedAt).toBeNull();
    const grades = await db
      .collection<GradeDocument>("grade")
      .countDocuments({ testId });
    expect(grades).toBe(0);
  });
});

/**
 * Feature: a school's AI grading drafts suggestions only for that school's tests
 * As a school admin working in one school
 * I want the AI grading service itself to refuse a test outside my school
 * So that another school's answers are never sent to the model or given suggestions
 */
describe("Feature: a school's AI grading drafts suggestions only for that school's tests", () => {
  let db: Db;
  let schoolBId: string;
  const gradeFreeTextBatch = vi.fn(async (items: AiGradeBatchInput[]) =>
    items.map((item) => ({
      questionId: item.questionId,
      score: 50,
      feedback: "AI feedback",
    })),
  );
  const stubAiClient: AiClient = { gradeFreeTextBatch };

  beforeEach(async () => {
    gradeFreeTextBatch.mockClear();
    ({ db } = await setupTestDb({ aiClient: stubAiClient }));
    schoolBId = (await addTestSchool("School B")).id;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("refuses to draft suggestions for a student on another school's test, without calling the model", async () => {
    const { testId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).aiGradeService.generateForStudent(
        testId,
        studentId,
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");

    expect(gradeFreeTextBatch).not.toHaveBeenCalled();
    const suggestions = await db
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .countDocuments({ testId });
    expect(suggestions).toBe(0);
  });

  it("refuses to redraft a student's suggestions on another school's test, without calling the model", async () => {
    const { testId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).aiGradeService.regenerateForStudent(
        testId,
        studentId,
        "school-b-admin",
        "Try again",
      ),
    ).rejects.toThrow("Test not found");

    expect(gradeFreeTextBatch).not.toHaveBeenCalled();
    const suggestions = await db
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .countDocuments({ testId });
    expect(suggestions).toBe(0);
  });

  it("refuses to redraft one question's suggestion on another school's test, without calling the model", async () => {
    const { testId, questionId, studentId } = await seedForeignWork();

    await expect(
      getTestServices(schoolBId).aiGradeService.regenerateForQuestion(
        testId,
        studentId,
        questionId,
        "school-b-admin",
        "Try again",
      ),
    ).rejects.toThrow("Test not found");

    expect(gradeFreeTextBatch).not.toHaveBeenCalled();
    const suggestions = await db
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .countDocuments({ testId });
    expect(suggestions).toBe(0);
  });
});
