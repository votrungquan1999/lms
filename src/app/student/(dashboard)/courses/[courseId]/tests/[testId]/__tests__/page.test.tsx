// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { McOption } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

// ── Auth-singleton mock plumbing (first FE test in the repo to exercise
//    `PageGuard.requireStudentLogin()`). Subsequent student-page tests reuse
//    `mockStudentSession(studentId)` below.
const mockGetSession = vi.fn();
const mockRequireStudentSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
  cookies: vi.fn(),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    requireStudentSession: (...args: unknown[]) =>
      mockRequireStudentSession(...args),
  }),
}));

function mockStudentSession(studentId: string) {
  const session = {
    role: "student" as const,
    userId: `auth-${studentId}`,
    username: `u-${studentId}`,
    studentId,
  };
  mockGetSession.mockResolvedValue(session);
  mockRequireStudentSession.mockResolvedValue(session);
}

/**
 * Seeds a course + test + 1 single_select MC question (A correct, B wrong) +
 * 1 enrolled student. Returns IDs and the option references so tests can
 * pick whichever option is "correct" vs "wrong" without re-querying.
 */
async function seedMcScenario(opts: {
  showGradeAfterSubmit: boolean;
  showCorrectAnswerAfterSubmit: boolean;
}) {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy: "admin",
    showGradeAfterSubmit: opts.showGradeAfterSubmit,
    showCorrectAnswerAfterSubmit: opts.showCorrectAnswerAfterSubmit,
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Pick one",
    createdBy: "admin",
    type: "single_select",
    options: [
      { text: "A (correct)", isCorrect: true },
      { text: "B (wrong)", isCorrect: false },
    ],
  });
  const [correctOption, wrongOption] = question.options as McOption[];

  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-1",
    username: "u1",
    name: "Stu",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );

  return {
    services,
    course,
    test,
    question,
    correctOption,
    wrongOption,
    student,
  };
}

describe("Feature: Student test page — MC correct-answer visibility gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("hides the missed-correct chip when showCorrectAnswerAfterSubmit is off and correctAnswersReleasedAt is null", async () => {
    const {
      services,
      course,
      test,
      question,
      correctOption,
      wrongOption,
      student,
    } = await seedMcScenario({
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: false,
    });

    // Student selects only the wrong option, then submits — auto-grading
    // runs inside submitTest and produces a Graded status with score=0.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption.id] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // The chip for the (unselected) correct option must NOT render — the gate
    // would otherwise have leaked the answer.
    expect(screen.queryByTestId(`mc-chip-${correctOption.id}`)).toBeNull();
    // The student's own (wrong) pick reads as neutral in the graded view
    // too, not "selected-wrong" — telling them it was wrong is itself a
    // partial leak of the withheld key.
    expect(screen.getByTestId(`mc-chip-${wrongOption.id}`)).toHaveAttribute(
      "data-state",
      "selected-neutral",
    );
  });

  it("renders the missed-correct chip when showCorrectAnswerAfterSubmit is on", async () => {
    const {
      services,
      course,
      test,
      question,
      correctOption,
      wrongOption,
      student,
    } = await seedMcScenario({
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
    });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption.id] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Gate is open via the flag — the unselected correct chip must render.
    expect(
      screen.getByTestId(`mc-chip-${correctOption.id}`),
    ).toBeInTheDocument();
  });

  it("renders the missed-correct chip when the flag is off but correctAnswersReleasedAt is set", async () => {
    const {
      services,
      course,
      test,
      question,
      correctOption,
      wrongOption,
      student,
    } = await seedMcScenario({
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: false,
    });

    // Flip the OR branch: release correct answers explicitly.
    await services.testService.releaseCorrectAnswers(test.id, "admin");

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption.id] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(
      screen.getByTestId(`mc-chip-${correctOption.id}`),
    ).toBeInTheDocument();
  });

  it("colors the student's own correct pick once the answer key is released, even while the score itself is still hidden", async () => {
    const { services, course, test, question, correctOption, student } =
      await seedMcScenario({
        showGradeAfterSubmit: false,
        showCorrectAnswerAfterSubmit: true,
      });

    // Student picks the correct option, then submits. The key is released
    // (showCorrectAnswerAfterSubmit), but the score/grade is not — the two
    // reveal gates are independent settings.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [correctOption.id] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // The key is out, so the student's own correct pick may be colored.
    const chip = screen.getByTestId(`mc-chip-${correctOption.id}`);
    expect(chip).toHaveAttribute("data-state", "selected-correct");
  });

  it("shows the student's own pick as a neutral chip, not selected-wrong, while both the score and the answer key are withheld", async () => {
    const { services, course, test, question, correctOption, student } =
      await seedMcScenario({
        showGradeAfterSubmit: false,
        showCorrectAnswerAfterSubmit: false,
      });

    // Student picks the CORRECT option — the bug this pins is that a
    // correct pick was shown as wrong once the key is withheld.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [correctOption.id] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const chip = screen.getByTestId(`mc-chip-${correctOption.id}`);
    expect(chip).toHaveAttribute("data-state", "selected-neutral");
  });
});

describe("Feature: Student test page — 3-tier grade visibility gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  /**
   * Seeds a course + test + 1 free-text question + 1 enrolled student.
   * Submits + grades the question so the test reaches `Graded`. Returns the
   * IDs needed for the gate assertions.
   */
  async function seedGradedScenario(opts: { showGradeAfterSubmit: boolean }) {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: opts.showGradeAfterSubmit,
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    // Manually grade the free-text question so testStatus === Graded.
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "Good",
      gradedBy: "admin",
    });
    return { services, course, test, question, student };
  }

  it("does NOT show grades when none of the three reveal tiers is satisfied (control case)", async () => {
    const { course, test, student } = await seedGradedScenario({
      showGradeAfterSubmit: false,
    });
    // No releaseGrades, no releaseGradeToStudent — every tier is closed.

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Grade-revealing UI must be absent.
    expect(screen.queryByText(/average score/i)).toBeNull();
    expect(screen.queryByText(/80\s*\/\s*100/)).toBeNull();
  });

  it("shows grades when the global showGradeAfterSubmit flag is on", async () => {
    const { course, test, student } = await seedGradedScenario({
      showGradeAfterSubmit: true,
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText(/average score/i)).toBeInTheDocument();
    expect(screen.getByText(/80\s*\/\s*100/)).toBeInTheDocument();
  });

  it("shows grades when global flags are off but the active submission has been released per-student", async () => {
    const { services, course, test, student } = await seedGradedScenario({
      showGradeAfterSubmit: false,
    });
    // Tier-3 only: per-student release on the active submission.
    await services.testSubmissionService.releaseGradeToStudent(
      test.id,
      student.id,
      "admin",
    );

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText(/average score/i)).toBeInTheDocument();
    expect(screen.getByText(/80\s*\/\s*100/)).toBeInTheDocument();
  });
});

describe("Feature: Student test page — redo cycle preserves submittability after soft-delete", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("student can resubmit after admin requests redo (regression for the soft-delete change)", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    // Student submits once.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "first attempt" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    // Admin requests redo.
    await services.redoRequestService.requestRedo(test.id, student.id, "admin");

    mockStudentSession(student.id);

    // The page should now show the test in a submittable state with a
    // visible "Redo Required" banner.
    const uiBefore = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    const { unmount } = render(uiBefore);
    expect(screen.getByText(/redo required/i)).toBeInTheDocument();

    // Drive the submit action directly: jsdom doesn't fully execute the
    // useActionState form-submit pathway, but calling the action mirrors
    // exactly what the form's submit would do.
    const { submitTestAction } = await import("../actions");
    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);
    const result = await submitTestAction(null, formData);
    expect(result.success).toBe(true);

    // Re-render the page after the resubmit. The user-observable outcome is
    // that the "Redo Required" banner disappears and the submitted-waiting
    // confirmation appears in its place — proving the resubmit cycle replaced
    // the active submission and cleared the redo request.
    unmount();
    const uiAfter = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(uiAfter);
    expect(screen.queryByText(/redo required/i)).toBeNull();
    expect(
      screen.getByText(/submitted and is waiting to be graded/i),
    ).toBeInTheDocument();
  });
});

describe("Feature: Student test page — Graded reads as Submitted until grades are released", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  /**
   * Seeds a course + test + 1 free-text question, submitted and graded so
   * the test is internally Graded, for a student enrolled in it.
   */
  async function seedInternallyGradedScenario(opts: {
    showGradeAfterSubmit: boolean;
  }) {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: opts.showGradeAfterSubmit,
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "Good",
      gradedBy: "admin",
    });
    return { services, course, test, student };
  }

  it("shows the 'Submitted' status badge, not 'Graded', while grades are withheld from the student", async () => {
    const { course, test, student } = await seedInternallyGradedScenario({
      showGradeAfterSubmit: false,
    });
    // No releaseGrades, no releaseGradeToStudent — the test is internally
    // Graded but nothing has been released to this student.

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.queryByText("Graded")).not.toBeInTheDocument();
  });

  it("shows the 'Graded' status badge and the grade once the teacher releases it to the student", async () => {
    const { services, course, test, student } =
      await seedInternallyGradedScenario({ showGradeAfterSubmit: false });
    // An explicit release, not auto-show: the badge and the grade must
    // both come back once the teacher lets them through.
    await services.testSubmissionService.releaseGradeToStudent(
      test.id,
      student.id,
      "admin",
    );

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText("Graded")).toBeInTheDocument();
    expect(screen.queryByText("Submitted")).not.toBeInTheDocument();
    expect(screen.getByText(/80\s*\/\s*100/)).toBeInTheDocument();
  });
});
