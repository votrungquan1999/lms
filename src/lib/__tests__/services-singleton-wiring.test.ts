import { randomUUID } from "node:crypto";
import { type Db, MongoClient } from "mongodb";
import type { AiGradeSuggestionDocument } from "src/lib/ai-grade-types";
import { getDatabase } from "src/lib/database";
import type { GradeDocument } from "src/lib/grade-service";
import {
  getAiGradeService,
  getAnnotationService,
  getAnswerService,
  getCourseJoinRequestService,
  getCourseService,
  getEnrollmentService,
  getGradeService,
  getGradeVisibilityService,
  getPoolQuestionService,
  getQuestionPoolService,
  getQuestionService,
  getRedoRequestService,
  getStudentService,
  getTestFeedbackService,
  getTestService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The real getters, against this file's own test database instead of the app's.
vi.mock("src/lib/database", () => ({ getDatabase: vi.fn() }));

/** Every real getter that builds one instance per school. */
const PER_SCHOOL_GETTERS = {
  getAiGradeService,
  getAnnotationService,
  getAnswerService,
  getCourseJoinRequestService,
  getCourseService,
  getEnrollmentService,
  getGradeService,
  getGradeVisibilityService,
  getPoolQuestionService,
  getQuestionPoolService,
  getQuestionService,
  getRedoRequestService,
  getStudentService,
  getTestFeedbackService,
  getTestService,
  getTestStatusService,
  getTestSubmissionService,
};

const PER_SCHOOL_GETTER_NAMES = Object.keys(
  PER_SCHOOL_GETTERS,
) as (keyof typeof PER_SCHOOL_GETTERS)[];

/** School A's graded work, seeded once through A's own real services. */
interface SchoolARecords {
  courseId: string;
  testId: string;
  questionId: string;
  studentId: string;
}

// The real getters cache per school for the life of the module, so the whole
// file shares one database and two schools unique to this run.
const SCHOOL_A = `wiring-a-${randomUUID()}`;
const SCHOOL_B = `wiring-b-${randomUUID()}`;

/**
 * Seeds, through school A's real per-school services, a course, a test with
 * one free-text question, an enrolled student who answered and submitted it,
 * a grade, an annotation, test feedback and an AI suggestion.
 */
async function seedSchoolA(db: Db): Promise<SchoolARecords> {
  const course = await (await getCourseService(SCHOOL_A)).createCourse({
    title: "School A Course",
    description: "",
    createdBy: "school-a-admin",
  });
  const test = await (await getTestService(SCHOOL_A)).createTest(course.id, {
    title: "School A Test",
    description: "",
    createdBy: "school-a-admin",
  });
  const question = await (await getQuestionService(SCHOOL_A)).addQuestion(
    test.id,
    { title: "Explain", content: "", createdBy: "school-a-admin" },
  );
  const student = await (
    await getStudentService(SCHOOL_A)
  ).createStudentDocument({
    authUserId: `auth-${randomUUID()}`,
    username: `wiring-${randomUUID()}`,
    name: "School A Student",
    createdBy: "school-a-admin",
  });
  await (await getEnrollmentService(SCHOOL_A)).enrollStudent(
    course.id,
    student.id,
    "school-a-admin",
  );
  await (await getAnswerService(SCHOOL_A)).submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "Because." },
  });
  await (await getTestSubmissionService(SCHOOL_A)).submitTest(
    test.id,
    student.id,
  );
  await (await getGradeService(SCHOOL_A)).gradeQuestion({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    score: 70,
    feedback: "School A's grade",
    gradedBy: "school-a-admin",
  });
  await (await getAnnotationService(SCHOOL_A)).saveAnnotations({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    gradedBy: "school-a-admin",
    annotations: [{ mediaKey: "photo.png", strokes: [] }],
  });
  await (await getTestFeedbackService(SCHOOL_A)).setTestFeedback({
    testId: test.id,
    studentId: student.id,
    feedback: "School A's feedback",
    gradedBy: "school-a-admin",
  });
  await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne({
    id: `suggestion-${test.id}`,
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    score: 90,
    feedback: "AI feedback",
    gradedAgainstAnswerId: "answer",
    model: "test-model",
    gradedBy: "ai",
    generatedByAdminId: "school-a-admin",
    generatedAt: new Date(),
    regenerateReason: null,
    appliedAt: null,
    appliedBy: null,
  });
  return {
    courseId: course.id,
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
  };
}

/**
 * Feature: the app's real per-school service wiring keeps schools apart
 * As the LMS system
 * I want every per-school service, and every service it is built from, to belong to one school
 * So that a mis-wired dependency can't let one school read or change another school's records
 */
describe("Feature: the app's real per-school service wiring keeps schools apart", () => {
  let client: MongoClient;
  let db: Db;
  let a: SchoolARecords;

  beforeAll(async () => {
    client = new MongoClient(
      process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    );
    await client.connect();
    db = client.db(`lms-test-${randomUUID()}`);
    vi.mocked(getDatabase).mockResolvedValue(db);
    a = await seedSchoolA(db);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it.each(PER_SCHOOL_GETTER_NAMES)(
    "%s returns one instance per school, never another school's",
    async (name) => {
      const getter = PER_SCHOOL_GETTERS[name];

      const first = await getter(SCHOOL_A);
      const again = await getter(SCHOOL_A);
      const otherSchool = await getter(SCHOOL_B);

      expect(again).toBe(first);
      expect(otherSchool).not.toBe(first);
    },
  );

  it("school A's own services see the seeded work, so every refusal below is about the school", async () => {
    expect(await (await getTestService(SCHOOL_A)).getTest(a.testId)).not.toBe(
      null,
    );
    expect(
      await (await getEnrollmentService(SCHOOL_A)).isEnrolled(
        a.courseId,
        a.studentId,
      ),
    ).toBe(true);
    const grades = await (await getGradeService(SCHOOL_A)).getStudentGrades(
      a.testId,
      a.studentId,
      TestStatus.Graded,
    );
    expect(grades.map((grade) => grade.score)).toEqual([70]);
  });

  it("school B's test, enrolment and grade services can't read school A's records", async () => {
    expect(await (await getTestService(SCHOOL_B)).getTest(a.testId)).toBe(null);
    const enrollments = await getEnrollmentService(SCHOOL_B);
    expect(await enrollments.isEnrolled(a.courseId, a.studentId)).toBe(false);
    expect(await enrollments.listEnrollmentsByCourse(a.courseId)).toEqual([]);
    expect(
      await (await getGradeService(SCHOOL_B)).getStudentGrades(
        a.testId,
        a.studentId,
        TestStatus.Graded,
      ),
    ).toEqual([]);
  });

  it("school B's question service can't add, edit or delete school A's questions", async () => {
    const questions = await getQuestionService(SCHOOL_B);

    await expect(
      questions.addQuestion(a.testId, {
        title: "Injected",
        content: "",
        createdBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");
    await expect(
      questions.updateQuestion(
        a.testId,
        a.questionId,
        { title: "Hijacked" },
        "school-b-admin",
      ),
    ).rejects.toThrow("Test not found");
    await expect(
      questions.deleteQuestion(a.testId, a.questionId, "school-b-admin"),
    ).rejects.toThrow("Test not found");
  });

  it("school B's answer service can't answer on school A's test", async () => {
    await expect(
      (await getAnswerService(SCHOOL_B)).submitAnswer({
        testId: a.testId,
        questionId: a.questionId,
        studentId: a.studentId,
        answer: { type: "free_text", text: "Injected" },
      }),
    ).rejects.toThrow("Test not found");
  });

  it("school B's grade, annotation and feedback services can't write on school A's test", async () => {
    await expect(
      (await getGradeService(SCHOOL_B)).gradeQuestion({
        testId: a.testId,
        questionId: a.questionId,
        studentId: a.studentId,
        score: 0,
        feedback: "Injected",
        gradedBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");
    await expect(
      (await getAnnotationService(SCHOOL_B)).saveAnnotations({
        testId: a.testId,
        questionId: a.questionId,
        studentId: a.studentId,
        gradedBy: "school-b-admin",
        annotations: [],
      }),
    ).rejects.toThrow("Test not found");
    await expect(
      (await getTestFeedbackService(SCHOOL_B)).setTestFeedback({
        testId: a.testId,
        studentId: a.studentId,
        feedback: "Injected",
        gradedBy: "school-b-admin",
      }),
    ).rejects.toThrow("Test not found");

    const grade = await db
      .collection<GradeDocument>("grade")
      .findOne({ testId: a.testId, questionId: a.questionId });
    expect(grade?.score).toBe(70);
  });

  it("school B's AI grading service can't apply or draft suggestions on school A's test", async () => {
    const aiGrade = await getAiGradeService(SCHOOL_B);

    await expect(
      aiGrade.applySuggestion(`suggestion-${a.testId}`, "school-b-admin", {
        testId: a.testId,
        studentId: a.studentId,
      }),
    ).rejects.toThrow("Test not found");
    await expect(
      aiGrade.generateForStudent(a.testId, a.studentId, "school-b-admin"),
    ).rejects.toThrow("Test not found");

    const suggestion = await db
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .findOne({ id: `suggestion-${a.testId}` });
    expect(suggestion?.appliedAt).toBeNull();
  });

  it("school B's enrolment service can't enrol into school A's course", async () => {
    await expect(
      (await getEnrollmentService(SCHOOL_B)).enrollStudent(
        a.courseId,
        a.studentId,
        "school-b-admin",
      ),
    ).rejects.toThrow("Course not found");
  });
});
