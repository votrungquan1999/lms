import type { Db } from "mongodb";
import type { AiClient, AiGradeBatchInput } from "src/lib/ai/ai-client";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import { insertRawEnrollment } from "src/tests/raw-enrollment-seeds";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import {
  releaseCorrectAnswersAction,
  releaseTestAction,
  requestRedoAction,
  saveAndNextAction,
  setTestFeedbackAction,
} from "../courses/[courseId]/tests/[testId]/grading/actions";
import {
  applyAiSuggestionAction,
  autoGradeSubmissionAction,
  regenerateQuestionAction,
  regenerateSubmissionAction,
} from "../courses/[courseId]/tests/[testId]/grading/ai-grade-actions";

interface School {
  id: string;
  name: string;
}

interface Fixture {
  courseId: string;
  testId: string;
  questionId: string;
  studentId: string;
}

/**
 * Signs in as the admin of a new, NON-default school, so an entry point that
 * forgets to scope its lookup shows the foreign data seeded in the default
 * school and the row fails.
 */
async function signInAsOtherSchoolAdmin(): Promise<School> {
  const school = await addTestSchool("School B");
  requireAdminSession.mockResolvedValue({
    userId: "admin-b",
    role: "admin",
    school,
  });
  return school;
}

function signInAsDefaultAdmin(): void {
  requireAdminSession.mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
}

/** Creates a course + test + free-text question + enrolled student, all through `services`. */
async function seedFixture(
  services: ReturnType<typeof getTestServices>,
  createdBy: string,
): Promise<Fixture> {
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy,
  });
  const test = await services.testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy,
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "c",
    createdBy,
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${course.id}`,
    username: `student-${course.id}`,
    name: "Student",
    createdBy,
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    createdBy,
  );
  return {
    courseId: course.id,
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
  };
}

/** Creates a course + test + free-text question in the DEFAULT school — a foreign record for these rows. */
async function createForeignFixture(): Promise<Fixture> {
  return seedFixture(getTestServices(), "default-school-admin");
}

/** A real stroke, so a leaked save would leave something behind. */
const ANNOTATIONS_JSON = JSON.stringify([
  {
    mediaKey: "media/answer.png",
    strokes: [{ color: "#f00", points: [{ x: 1, y: 2 }] }],
  },
]);

/** A Save & next form for the fixture's answer, carrying the photo marks as JSON. */
function markedForm(fixture: Fixture, annotationsJson: string): FormData {
  const formData = new FormData();
  formData.set("testId", fixture.testId);
  formData.set("courseId", fixture.courseId);
  formData.set("questionId", fixture.questionId);
  formData.set("studentId", fixture.studentId);
  formData.set("routeKind", "hub");
  formData.set("mode", "student");
  formData.set("score", "80");
  formData.set("feedback", "ok");
  formData.set("annotations", annotationsJson);
  return formData;
}

/** A student of the default school who is enrolled in no course. */
async function createOutsider(): Promise<string> {
  const outsider = await getTestServices().studentService.createStudentDocument(
    {
      authUserId: "auth-outsider",
      username: "outsider",
      name: "Outsider",
      createdBy: "admin-1",
    },
  );
  return outsider.id;
}

/** Gives the fixture's student an answer, so AI grading has something to grade. */
async function submitAnswer(fixture: Fixture): Promise<void> {
  await getTestServices().answerService.submitAnswer({
    testId: fixture.testId,
    questionId: fixture.questionId,
    studentId: fixture.studentId,
    answer: { type: "free_text", text: "an answer" },
  });
}

/** Deterministic stub — echoes a fixed score/feedback for every candidate. */
const stubAiClient: AiClient = {
  async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
    return items.map((item) => ({
      questionId: item.questionId,
      score: 90,
      feedback: "auto",
      solution: "",
    }));
  },
};

let db: Db;

beforeEach(async () => {
  ({ db } = await setupTestDb({ aiClient: stubAiClient }));
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: a school admin can never grade, annotate, or manage another
 * school's tests or students, and grading work only lands on the student
 * and test it was made for
 * As a school admin working in one school
 * I want every grading entry point to refuse another school's test, a
 * foreign student, or an unenrolled student
 * So that another school's grading data can never be touched through mine
 */
describe("Feature: a school admin can never grade another school's test", () => {
  it("saveAndNextAction refuses another school's student even when legacy data enrols them in the admin's own course", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "admin-1");
    const otherSchool = await addTestSchool("School B");
    const foreignStudent = await getTestServices(
      otherSchool.id,
    ).studentService.createStudentDocument({
      authUserId: "auth-foreign-enrolled",
      username: "foreign.enrolled",
      name: "Foreign Enrolled",
      createdBy: "admin-b",
    });
    await insertRawEnrollment(db, own.courseId, foreignStudent.id);
    const formData = new FormData();
    formData.set("testId", own.testId);
    formData.set("courseId", own.courseId);
    formData.set("questionId", own.questionId);
    formData.set("studentId", foreignStudent.id);
    formData.set("routeKind", "hub");
    formData.set("mode", "student");
    formData.set("score", "80");
    formData.set("feedback", "ok");

    expect(await saveAndNextAction(formData)).toEqual({
      message: "Student not found",
    });
    expect(
      await getTestServices().gradeService.getGrade(
        own.testId,
        own.questionId,
        foreignStudent.id,
      ),
    ).toBeNull();
  });

  it("saveAndNextAction refuses a question id from another test", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "admin-1");
    const otherQuestion = await getTestServices().questionService.addQuestion(
      own.testId,
      { type: "free_text", title: "Q2", content: "c", createdBy: "admin-1" },
    );
    const otherTest = await getTestServices().testService.createTest(
      own.courseId,
      { title: "Other Test", description: "", createdBy: "admin-1" },
    );
    const formData = new FormData();
    formData.set("testId", otherTest.id);
    formData.set("courseId", own.courseId);
    formData.set("questionId", otherQuestion.id);
    formData.set("studentId", own.studentId);
    formData.set("routeKind", "hub");
    formData.set("mode", "student");
    formData.set("score", "80");
    formData.set("feedback", "ok");

    expect(await saveAndNextAction(formData)).toEqual({
      message: "Question not found",
    });
    expect(
      await getTestServices().gradeService.getGrade(
        otherTest.id,
        otherQuestion.id,
        own.studentId,
      ),
    ).toBeNull();
  });

  it("saveAndNextAction stores the photo marks, strokes and texts, together with the grade", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "default-school-admin");
    const photoKey = `answers/${own.studentId}/p.png`;
    await getTestServices().answerService.submitAnswer({
      testId: own.testId,
      questionId: own.questionId,
      studentId: own.studentId,
      answer: { type: "image", mediaKeys: [photoKey] },
    });
    await getTestServices().testSubmissionService.submitTest(
      own.testId,
      own.studentId,
    );
    const entries = [
      {
        mediaKey: photoKey,
        strokes: [{ color: "#f00", points: [{ x: 0.1, y: 0.2 }] }],
        texts: [{ x: 0.25, y: 0.5, text: "i never changes", color: "#ef4444" }],
      },
    ];

    await expect(
      saveAndNextAction(markedForm(own, JSON.stringify(entries))),
    ).rejects.toThrow("__REDIRECT__");

    expect(
      await getTestServices().annotationService.getAnnotations(
        own.testId,
        own.questionId,
        own.studentId,
      ),
    ).toEqual(entries);
    expect(
      (
        await getTestServices().gradeService.getGrade(
          own.testId,
          own.questionId,
          own.studentId,
        )
      )?.score,
    ).toBe(80);
  });

  it("saveAndNextAction stores no photo marks when the grade fails to save", async () => {
    signInAsDefaultAdmin();
    const own = await createForeignFixture();
    vi.spyOn(
      getTestServices().gradeService,
      "gradeQuestion",
    ).mockRejectedValueOnce(new Error("Database unavailable"));

    expect(await saveAndNextAction(markedForm(own, ANNOTATIONS_JSON))).toEqual({
      message: "Database unavailable",
    });

    expect(
      await getTestServices().annotationService.getAnnotations(
        own.testId,
        own.questionId,
        own.studentId,
      ),
    ).toEqual([]);
  });

  it("saveAndNextAction refuses a foreign test and stores neither a grade nor marks", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();

    expect(
      await saveAndNextAction(markedForm(foreign, ANNOTATIONS_JSON)),
    ).toEqual({ message: "Test not found" });

    expect(
      await getTestServices().annotationService.getAnnotations(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toEqual([]);
    expect(
      await getTestServices().gradeService.getGrade(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toBeNull();
  });

  it("saveAndNextAction refuses a text mark off the palette or over 200 characters and stores no grade or marks", async () => {
    signInAsDefaultAdmin();
    const own = await createForeignFixture();
    const badTexts = [
      { x: 0.25, y: 0.5, text: "ok", color: "#ff00ff" },
      { x: 0.25, y: 0.5, text: "a".repeat(201), color: "#ef4444" },
      { x: 1.5, y: 0.5, text: "ok", color: "#ef4444" },
    ];

    for (const bad of badTexts) {
      expect(
        await saveAndNextAction(
          markedForm(
            own,
            JSON.stringify([
              { mediaKey: "media/answer.png", strokes: [], texts: [bad] },
            ]),
          ),
        ),
      ).toEqual({ message: expect.any(String) });
    }
    expect(
      await getTestServices().annotationService.getAnnotations(
        own.testId,
        own.questionId,
        own.studentId,
      ),
    ).toEqual([]);
    expect(
      await getTestServices().gradeService.getGrade(
        own.testId,
        own.questionId,
        own.studentId,
      ),
    ).toBeNull();
  });

  it("setTestFeedbackAction refuses a foreign test and writes no feedback", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);
    formData.set("feedback", "hacked");

    const result = await setTestFeedbackAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().testFeedbackService.getTestFeedback(
        foreign.testId,
        foreign.studentId,
      ),
    ).toBeNull();
  });

  it("releaseTestAction refuses a foreign test and releases neither grades nor correct answers", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("mode", "whole");
    formData.set("alsoCorrectAnswers", "true");

    const result = await releaseTestAction(null, formData);

    expect(result.success).toBe(false);
    const test = await getTestServices().testService.getTest(foreign.testId);
    expect(test?.gradesReleasedAt).toBeNull();
    expect(test?.correctAnswersReleasedAt).toBeNull();
  });

  it("releaseTestAction in chosen mode refuses a foreign test and releases no student", async () => {
    const foreign = await createForeignFixture();
    await getTestServices().testSubmissionService.submitTest(
      foreign.testId,
      foreign.studentId,
    );
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("mode", "chosen");
    formData.append("studentId", foreign.studentId);

    const result = await releaseTestAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      (
        await getTestServices().testSubmissionService.getActiveSubmission(
          foreign.testId,
          foreign.studentId,
        )
      )?.releasedAt,
    ).toBeNull();
  });

  it("releaseTestAction in chosen mode refuses a student outside the course and releases nobody", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "admin-1");
    await submitAnswer(own);
    await getTestServices().testSubmissionService.submitTest(
      own.testId,
      own.studentId,
    );
    await getTestServices().gradeService.gradeQuestion({
      testId: own.testId,
      questionId: own.questionId,
      studentId: own.studentId,
      score: 90,
      feedback: "",
      gradedBy: "admin-1",
    });
    const outsiderId = await createOutsider();
    const formData = new FormData();
    formData.set("testId", own.testId);
    formData.set("courseId", own.courseId);
    formData.set("mode", "chosen");
    formData.append("studentId", own.studentId);
    formData.append("studentId", outsiderId);

    const result = await releaseTestAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Student not found");
    expect(
      (
        await getTestServices().testSubmissionService.getActiveSubmission(
          own.testId,
          own.studentId,
        )
      )?.releasedAt,
    ).toBeNull();
  });

  it("releaseCorrectAnswersAction refuses a foreign test and leaves it un-released", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);

    const result = await releaseCorrectAnswersAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      (await getTestServices().testService.getTest(foreign.testId))
        ?.correctAnswersReleasedAt,
    ).toBeNull();
  });

  it("requestRedoAction refuses a foreign test and creates no redo request", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);

    const result = await requestRedoAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().redoRequestService.getActiveRedoRequest(
        foreign.testId,
        foreign.studentId,
      ),
    ).toBeNull();
  });

  it("saveAndNextAction refuses a foreign test and writes no grade", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("questionId", foreign.questionId);
    formData.set("studentId", foreign.studentId);
    formData.set("routeKind", "hub");
    formData.set("mode", "student");
    formData.set("score", "80");
    formData.set("feedback", "hacked");

    expect(await saveAndNextAction(formData)).toEqual({
      message: "Test not found",
    });
    expect(
      await getTestServices().gradeService.getGrade(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toBeNull();
  });

  it.each(["//evil.example", "https://evil.example"])(
    "saveAndNextAction takes no link from the browser: the route kind %s is refused",
    async (routeKind) => {
      signInAsDefaultAdmin();
      const own = await seedFixture(getTestServices(), "admin-1");
      const formData = new FormData();
      formData.set("testId", own.testId);
      formData.set("courseId", own.courseId);
      formData.set("questionId", own.questionId);
      formData.set("studentId", own.studentId);
      formData.set("routeKind", routeKind);
      formData.set("mode", "student");
      formData.set("score", "80");
      formData.set("feedback", "x");

      expect(await saveAndNextAction(formData)).toEqual({
        message: expect.any(String),
      });
      expect(
        await getTestServices().gradeService.getGrade(
          own.testId,
          own.questionId,
          own.studentId,
        ),
      ).toBeNull();
    },
  );

  it("autoGradeSubmissionAction refuses a foreign test and generates no suggestion", async () => {
    const foreign = await createForeignFixture();
    await submitAnswer(foreign);
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);

    const result = await autoGradeSubmissionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().aiGradeService.hasAnySuggestionsForStudent(
        foreign.testId,
        foreign.studentId,
      ),
    ).toBe(false);
  });

  it("regenerateSubmissionAction refuses a foreign test and generates no suggestion", async () => {
    const foreign = await createForeignFixture();
    await submitAnswer(foreign);
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);
    formData.set("reason", "reconsider");

    const result = await regenerateSubmissionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().aiGradeService.hasAnySuggestionsForStudent(
        foreign.testId,
        foreign.studentId,
      ),
    ).toBe(false);
  });

  it("regenerateQuestionAction refuses a foreign test and generates no suggestion", async () => {
    const foreign = await createForeignFixture();
    await submitAnswer(foreign);
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);
    formData.set("questionId", foreign.questionId);
    formData.set("reason", "reconsider");

    const result = await regenerateQuestionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().aiGradeService.hasAnySuggestionsForStudent(
        foreign.testId,
        foreign.studentId,
      ),
    ).toBe(false);
  });

  it("regenerateQuestionAction refuses a question id from another test", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "admin-1");
    const otherTest = await getTestServices().testService.createTest(
      own.courseId,
      { title: "Other Test", description: "", createdBy: "admin-1" },
    );
    const formData = new FormData();
    formData.set("testId", otherTest.id);
    formData.set("courseId", own.courseId);
    formData.set("studentId", own.studentId);
    formData.set("questionId", own.questionId);
    formData.set("reason", "reconsider");

    const result = await regenerateQuestionAction(null, formData);

    expect(result.success).toBe(false);
  });

  it("applyAiSuggestionAction refuses a foreign test and applies nothing", async () => {
    const foreign = await createForeignFixture();
    // A real, applicable suggestion — without the parent check this apply
    // would otherwise succeed, so the refusal genuinely comes from scoping.
    await submitAnswer(foreign);
    const [suggestion] =
      await getTestServices().aiGradeService.generateForStudent(
        foreign.testId,
        foreign.studentId,
        "default-school-admin",
      );
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);
    formData.set("suggestionId", suggestion.id);

    const result = await applyAiSuggestionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().gradeService.getGrade(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toBeNull();
  });
});

/**
 * Feature: grading work only lands on a student enrolled in the test's course
 * As a school admin working in one school
 * I want a per-student grading write naming a student outside the test's
 * course to be refused
 * So that feedback, annotations, redos and grades never land on the wrong student
 */
describe("Feature: grading work only lands on a student enrolled in the test's course", () => {
  it.each<[string, (own: Fixture, studentId: string) => Promise<void>]>([
    [
      "setTestFeedbackAction",
      async (own, studentId) => {
        const formData = new FormData();
        formData.set("testId", own.testId);
        formData.set("courseId", own.courseId);
        formData.set("studentId", studentId);
        formData.set("feedback", "misplaced");
        const result = await setTestFeedbackAction(null, formData);
        expect(result.success).toBe(false);
        expect(
          await getTestServices().testFeedbackService.getTestFeedback(
            own.testId,
            studentId,
          ),
        ).toBeNull();
      },
    ],
    [
      "requestRedoAction",
      async (own, studentId) => {
        const formData = new FormData();
        formData.set("testId", own.testId);
        formData.set("courseId", own.courseId);
        formData.set("studentId", studentId);
        const result = await requestRedoAction(null, formData);
        expect(result.success).toBe(false);
        expect(
          await getTestServices().redoRequestService.getActiveRedoRequest(
            own.testId,
            studentId,
          ),
        ).toBeNull();
      },
    ],
    [
      "saveAndNextAction",
      async (own, studentId) => {
        const formData = new FormData();
        formData.set("testId", own.testId);
        formData.set("courseId", own.courseId);
        formData.set("questionId", own.questionId);
        formData.set("studentId", studentId);
        formData.set("routeKind", "hub");
        formData.set("mode", "student");
        formData.set("score", "80");
        formData.set("feedback", "misplaced");
        formData.set("annotations", ANNOTATIONS_JSON);
        expect(await saveAndNextAction(formData)).toEqual({
          message: "Student not found",
        });
        expect(
          await getTestServices().annotationService.getAnnotations(
            own.testId,
            own.questionId,
            studentId,
          ),
        ).toEqual([]);
        expect(
          await getTestServices().gradeService.getGrade(
            own.testId,
            own.questionId,
            studentId,
          ),
        ).toBeNull();
      },
    ],
  ])(
    "%s refuses a same-school student not enrolled in the test's course and writes nothing",
    async (_name, attempt) => {
      signInAsDefaultAdmin();
      const own = await seedFixture(getTestServices(), "admin-1");
      const outsiderId = await createOutsider();

      await attempt(own, outsiderId);
    },
  );
});
