import type { AiClient, AiGradeBatchInput } from "src/lib/ai/ai-client";
import { TEST_SCHOOL } from "src/tests/create-test-db";
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
  gradeQuestionAction,
  releaseCorrectAnswersAction,
  releaseGradeForStudentAction,
  releaseGradesAction,
  requestRedoAction,
  saveAndJumpToNextAction,
  saveAnnotationsAction,
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

beforeEach(async () => {
  await setupTestDb({ aiClient: stubAiClient });
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
  it("gradeQuestionAction refuses a foreign test and writes no grade", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("questionId", foreign.questionId);
    formData.set("studentId", foreign.studentId);
    formData.set("score", "80");
    formData.set("feedback", "ok");

    const result = await gradeQuestionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().gradeService.getGrade(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toBeNull();
  });

  it("gradeQuestionAction refuses a same-school student not enrolled in the test's course", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "admin-1");
    const outsiderId = await createOutsider();
    const formData = new FormData();
    formData.set("testId", own.testId);
    formData.set("courseId", own.courseId);
    formData.set("questionId", own.questionId);
    formData.set("studentId", outsiderId);
    formData.set("score", "80");
    formData.set("feedback", "ok");

    const result = await gradeQuestionAction(null, formData);

    expect(result).toEqual({ success: false, message: "Student not found" });
    expect(
      await getTestServices().gradeService.getGrade(
        own.testId,
        own.questionId,
        outsiderId,
      ),
    ).toBeNull();
  });

  it("gradeQuestionAction refuses a question id from another test", async () => {
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
    formData.set("score", "80");
    formData.set("feedback", "ok");

    const result = await gradeQuestionAction(null, formData);

    expect(result).toEqual({ success: false, message: "Question not found" });
    expect(
      await getTestServices().gradeService.getGrade(
        otherTest.id,
        otherQuestion.id,
        own.studentId,
      ),
    ).toBeNull();
  });

  it("gradeQuestionAction still grades the admin's own enrolled student", async () => {
    signInAsDefaultAdmin();
    const own = await seedFixture(getTestServices(), "admin-1");
    const formData = new FormData();
    formData.set("testId", own.testId);
    formData.set("courseId", own.courseId);
    formData.set("questionId", own.questionId);
    formData.set("studentId", own.studentId);
    formData.set("score", "80");
    formData.set("feedback", "ok");

    const result = await gradeQuestionAction(null, formData);

    expect(result.success).toBe(true);
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

  it("saveAnnotationsAction refuses a foreign test and saves no annotation", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();

    const result = await saveAnnotationsAction({
      testId: foreign.testId,
      courseId: foreign.courseId,
      questionId: foreign.questionId,
      studentId: foreign.studentId,
      annotationsJson: ANNOTATIONS_JSON,
    });

    expect(result.success).toBe(false);
    expect(
      await getTestServices().annotationService.getAnnotations(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toEqual([]);
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

  it("releaseGradesAction refuses a foreign test and leaves it un-released", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);

    const result = await releaseGradesAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      (await getTestServices().testService.getTest(foreign.testId))
        ?.gradesReleasedAt,
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

  it("releaseGradeForStudentAction refuses a foreign test and releases nothing", async () => {
    const foreign = await createForeignFixture();
    // A real active submission — without the parent check this release would
    // otherwise succeed, so the refusal genuinely comes from school scoping.
    await getTestServices().testSubmissionService.submitTest(
      foreign.testId,
      foreign.studentId,
    );
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("studentId", foreign.studentId);

    const result = await releaseGradeForStudentAction(null, formData);

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

  it("saveAndJumpToNextAction refuses a foreign test and writes no grade", async () => {
    await signInAsOtherSchoolAdmin();
    const foreign = await createForeignFixture();
    const formData = new FormData();
    formData.set("testId", foreign.testId);
    formData.set("courseId", foreign.courseId);
    formData.set("questionId", foreign.questionId);
    formData.set("studentId", foreign.studentId);
    formData.set("currentStudentId", foreign.studentId);
    formData.set("candidateIds", foreign.studentId);
    formData.set("returnPath", "/admin/grading/x");
    formData.set("mode", "student");
    formData.set("score", "80");
    formData.set("feedback", "hacked");

    await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
      "Test not found",
    );
    expect(
      await getTestServices().gradeService.getGrade(
        foreign.testId,
        foreign.questionId,
        foreign.studentId,
      ),
    ).toBeNull();
  });

  it.each(["//evil.example", "https://evil.example"])(
    "saveAndJumpToNextAction refuses the returnPath %s",
    async (returnPath) => {
      signInAsDefaultAdmin();
      const own = await seedFixture(getTestServices(), "admin-1");
      const formData = new FormData();
      formData.set("testId", own.testId);
      formData.set("courseId", own.courseId);
      formData.set("questionId", own.questionId);
      formData.set("studentId", own.studentId);
      formData.set("currentStudentId", own.studentId);
      formData.set("candidateIds", own.studentId);
      formData.set("returnPath", returnPath);
      formData.set("mode", "student");
      formData.set("score", "80");
      formData.set("feedback", "x");

      await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
        "Invalid return path",
      );
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
      "saveAnnotationsAction",
      async (own, studentId) => {
        const result = await saveAnnotationsAction({
          ...own,
          studentId,
          annotationsJson: ANNOTATIONS_JSON,
        });
        expect(result.success).toBe(false);
        expect(
          await getTestServices().annotationService.getAnnotations(
            own.testId,
            own.questionId,
            studentId,
          ),
        ).toEqual([]);
      },
    ],
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
      "saveAndJumpToNextAction",
      async (own, studentId) => {
        const formData = new FormData();
        formData.set("testId", own.testId);
        formData.set("courseId", own.courseId);
        formData.set("questionId", own.questionId);
        formData.set("studentId", studentId);
        formData.set("currentStudentId", studentId);
        formData.set("candidateIds", studentId);
        formData.set("returnPath", "/admin/grading/x");
        formData.set("mode", "student");
        formData.set("score", "80");
        formData.set("feedback", "misplaced");
        await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
          "Student not found",
        );
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
