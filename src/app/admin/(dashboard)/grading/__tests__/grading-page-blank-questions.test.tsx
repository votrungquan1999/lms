// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingPage from "../../courses/[courseId]/tests/[testId]/grading/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    requireAdminSession: vi
      .fn()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL }),
  }),
}));

/** The group headers of the student picker, in order. */
async function pickerGroups(): Promise<(string | undefined)[]> {
  await userEvent.click(
    screen.getByRole("button", { name: /student picker/i }),
  );
  const menu = await screen.findByRole("menu");
  return [...menu.querySelectorAll('[data-slot="dropdown-menu-label"]')].map(
    (el) => el.textContent?.trim(),
  );
}

describe("Feature: Admin grading hub treats a submitted test with one blank question as fully graded once the answered question is graded", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the student card with a '1/1 graded' badge denominator AND the Graded status badge when the student answered only Q1, submitted, and the teacher graded Q1", async () => {
    // Given: a 2-question test, one student who answered Q1 only (Q2
    // blank), submitted the test, and the teacher graded Q1.
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
      showGradeAfterSubmit: false,
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Answered question",
      createdBy: "admin",
      type: "free_text",
    });
    const q2 = await services.questionService.addQuestion(test.id, {
      title: "Q2",
      content: "Blank question",
      createdBy: "admin",
      type: "free_text",
    });

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-blank",
      username: "blank-user",
      name: "Blank Bea",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "I answered Q1" },
    });
    // Q2 deliberately left blank — no submitAnswer.
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 100,
      feedback: "ok",
      gradedBy: "admin",
    });

    // When: the admin opens the blank question's page.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
      searchParams: Promise.resolve({
        studentId: student.id,
        questionId: q2.id,
      }),
    });
    render(ui);

    // Then: the student card uses the answered-question count as the
    // badge denominator (1/1, not 1/2), names the one blank question, and
    // the status badge reads "Graded" — proving Step 1's TestStatusService
    // change + Step 6's denominator change both took effect end-to-end
    // through the UI, plus the blank count the student's pill now admits.
    const card = await screen.findByTestId(`student-card-${student.id}`);
    expect(within(card).getByRole("link", { name: "Q1 graded" })).toBeVisible();
    expect(within(card).getByRole("link", { name: "Q2 blank" })).toBeVisible();
    expect(await pickerGroups()).toEqual(["Graded · 1"]);
    // And the blank free-text question reads as a counted 0 for a Graded
    // student, not as an answer still to come.
    expect(
      within(card).getByText("No answer — counts as 0"),
    ).toBeInTheDocument();
  });

  it("counts an all-blank Graded student in the 'fully graded' fraction over the students who handed in", async () => {
    // Given a 1-question test with two enrolled students: one submits
    // having answered nothing at all (Graded, all-blank); the other never
    // opens the test (NotStarted).
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
    await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
      type: "free_text",
    });

    const gradedBlank = await services.studentService.createStudentDocument({
      authUserId: "auth-graded-blank",
      username: "graded-blank",
      name: "Graded Blank",
      createdBy: "admin",
    });
    const untouched = await services.studentService.createStudentDocument({
      authUserId: "auth-untouched",
      username: "untouched",
      name: "Untouched",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      gradedBlank.id,
      "admin",
    );
    await services.enrollmentService.enrollStudent(
      course.id,
      untouched.id,
      "admin",
    );
    await services.testSubmissionService.submitTest(test.id, gradedBlank.id);

    // When: the admin grading page renders.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: the all-blank Graded student counts toward "fully graded" and
    // the untouched student, who has not handed in, is not in the total — 1 of 1.
    const fraction = screen.getByTestId("grading-progress-fraction");
    expect(fraction.textContent).toBe("1 of 1 fully graded");
  });

  it("counts a submitted student's blank answer toward the By-question 'students graded' fraction", async () => {
    // Given a 1-question test with three enrolled students: one submits
    // having left the question blank (counts as 0, nothing left to grade);
    // one submits an answer the teacher has not scored yet; the other
    // never opens the test (not submitted, still genuinely open).
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
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
      type: "free_text",
    });

    const submittedBlank = await services.studentService.createStudentDocument({
      authUserId: "auth-submitted-blank",
      username: "submitted-blank",
      name: "Submitted Blank",
      createdBy: "admin",
    });
    const untouched = await services.studentService.createStudentDocument({
      authUserId: "auth-untouched-2",
      username: "untouched-2",
      name: "Untouched Two",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      submittedBlank.id,
      "admin",
    );
    await services.enrollmentService.enrollStudent(
      course.id,
      untouched.id,
      "admin",
    );
    await services.testSubmissionService.submitTest(test.id, submittedBlank.id);
    const awaiting = await services.studentService.createStudentDocument({
      authUserId: "auth-awaiting",
      username: "awaiting",
      name: "Awaiting Score",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      awaiting.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: awaiting.id,
      answer: { type: "free_text", text: "needs a teacher" },
    });
    await services.testSubmissionService.submitTest(test.id, awaiting.id);

    // When: the admin grading page renders in By-question mode.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
      searchParams: Promise.resolve({ mode: "question", questionId: q1.id }),
    });
    render(ui);

    // Then: only the submitted blank counts as resolved for this question;
    // the unscored answer and the untouched student do not — 1 of 3.
    const fraction = screen.getByTestId("grading-progress-fraction");
    expect(fraction.textContent).toBe("1 of 3 students graded");
  });

  it("does not call an unanswered question blank while the student can still answer it", async () => {
    // Given: a 2-question test; the student answered Q1 and has not
    // submitted, so Q2 is still open, not blank.
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
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
      type: "free_text",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Q2",
      content: "Q2",
      createdBy: "admin",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-open",
      username: "open-user",
      name: "Open Olga",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "Q1 so far" },
    });

    // When: the admin grading page renders focused on that student.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
      searchParams: Promise.resolve({ studentId: student.id }),
    });
    render(ui);

    // Then: neither the picker nor the question row admits a blank yet.
    const card = screen.getByTestId(`student-card-${student.id}`);
    expect(
      within(card).getByRole("link", { name: "Q1 needs grading" }),
    ).toBeVisible();
    expect(within(card).queryByRole("link", { name: /blank/ })).toBeNull();
    expect(screen.queryByText(/blank/)).toBeNull();
    expect(await pickerGroups()).toEqual(["Still writing · 1"]);
    expect(screen.queryByText(/blank/)).toBeNull();
  });

  it("stops counting an answer once its question is deleted, so the badge never shows an impossible fraction and the student reaches Graded", async () => {
    // Given: a 2-question test. The student answered both, the teacher
    // graded Q1, then deletes Q2 before ever grading it — its answer is
    // now dangling and can never be graded.
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
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
      type: "free_text",
    });
    const q2 = await services.questionService.addQuestion(test.id, {
      title: "Q2 (will be deleted)",
      content: "Q2",
      createdBy: "admin",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-deleted-q",
      username: "deleted-q",
      name: "Deleted Question Dana",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer 1" },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer 2" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 90,
      feedback: "Nice",
      gradedBy: "admin",
    });
    await services.questionService.deleteQuestion(q2.testId, q2.id, "admin");

    // When: the admin grading page renders focused on that student.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
      searchParams: Promise.resolve({ studentId: student.id }),
    });
    render(ui);

    // Then: the student reads "1/1 graded" and the question row shows
    // only the live question — the deleted question's dangling answer
    // inflates nothing and leaves no blank box — and the status badge
    // reads Graded, not stuck at Submitted.
    const card = screen.getByTestId(`student-card-${student.id}`);
    expect(within(card).getAllByRole("link", { name: /^Q\d/ })).toHaveLength(1);
    expect(within(card).getByRole("link", { name: "Q1 graded" })).toBeVisible();
    expect(await pickerGroups()).toEqual(["Graded · 1"]);
    expect(screen.queryByText(/blank/)).toBeNull();
  });

  it("stops counting a grade once its question is deleted, so graded never exceeds answered", async () => {
    // Given: a 2-question test. The student answered both, submitted, and
    // the teacher graded both — then deleted Q2, leaving its grade behind.
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
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-deleted-graded",
      username: "deleted-graded",
      name: "Deleted Graded Dev",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    const questionIds: string[] = [];
    for (const title of ["Q1", "Q2 (will be deleted)"]) {
      const question = await services.questionService.addQuestion(test.id, {
        title,
        content: title,
        createdBy: "admin",
        type: "free_text",
      });
      questionIds.push(question.id);
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: `answer to ${title}` },
      });
    }
    await services.testSubmissionService.submitTest(test.id, student.id);
    for (const questionId of questionIds) {
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId,
        studentId: student.id,
        score: 90,
        feedback: "",
        gradedBy: "admin",
      });
    }
    await services.questionService.deleteQuestion(
      test.id,
      questionIds[1],
      "admin",
    );

    // When: the admin grading page renders focused on that student.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
      searchParams: Promise.resolve({ studentId: student.id }),
    });
    render(ui);

    // Then: the deleted question's leftover grade is not counted — the
    // student reads "1/1 graded", never "2/1", and the question row
    // has one box.
    const card = screen.getByTestId(`student-card-${student.id}`);
    expect(within(card).getAllByRole("link", { name: /^Q\d/ })).toHaveLength(1);
    expect(within(card).getByRole("link", { name: "Q1 graded" })).toBeVisible();
    expect(await pickerGroups()).toEqual(["Graded · 1"]);
  });
});
