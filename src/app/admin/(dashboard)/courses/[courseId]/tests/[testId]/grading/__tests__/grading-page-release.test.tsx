// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { revalidatePath } from "next/cache";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingPage from "../page";

const mockRequireAdminSession = vi.fn();

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
    requireAdminSession: (...args: unknown[]) =>
      mockRequireAdminSession(...args),
  }),
}));

describe("Feature: Admin per-student grade release", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("offers Release to <student> in More for an eligible Graded student, releases her grade alone, DB stamps releasedAt, the item reads Released to <student>, and the student path is revalidated", async () => {
    const user = userEvent.setup();
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    // Test with delayed release: flag off, no global release timestamp.
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: false,
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

    // Student submits + admin grades → testStatus reaches Graded.
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

    // Render the admin grading page.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    await user.click(await screen.findByRole("button", { name: /more/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /release to stu/i }),
    );

    // The item swaps to its released state.
    await user.click(screen.getByRole("button", { name: /more/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("menuitem", { name: /released to stu/i }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    // DB reflects the release.
    const active = await services.testSubmissionService.getActiveSubmission(
      test.id,
      student.id,
    );
    expect(active?.releasedAt).toBeInstanceOf(Date);
    expect(active?.releasedBy).toBe("admin-1");

    // Revalidate fan-out includes the student page.
    const revalidated = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(revalidated).toContain(
      `/student/courses/${course.id}/tests/${test.id}`,
    );
    expect(revalidated).toContain(
      `/admin/courses/${course.id}/tests/${test.id}/grading`,
    );
    expect(revalidated).toContain(`/admin/grading/${test.id}`);
  });

  it("offers no Release to item for Submitted / NotStarted / open-redo students or when the global flag is on, and shows it disabled as Released to for an already-released student", async () => {
    // Visibility matrix of the More menu's release item. Seeds the students,
    // each isolated in their own course+test so we can independently configure
    // the test-level flag for case 3 (global flag on).
    const services = getTestServices();
    // Opens More when the card has one and checks it offers no release.
    const expectNoReleaseItem = async (card: HTMLElement) => {
      const more = within(card).queryByRole("button", { name: /more/i });
      if (more) await userEvent.click(more);
      expect(
        screen.queryByRole("menuitem", { name: /release to|released to/i }),
      ).toBeNull();
      await userEvent.keyboard("{Escape}");
    };

    // --- Test A: flag OFF (per-student release scenario) -------------------
    const courseA = await services.courseService.createCourse({
      title: "Course A",
      description: "",
      createdBy: "admin",
    });
    const testA = await services.testService.createTest(courseA.id, {
      title: "Test A",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: false,
    });
    const questionA = await services.questionService.addQuestion(testA.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin",
      type: "free_text",
    });

    // Student 1 — Submitted (no grades). Button must be absent.
    const submittedStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-submitted",
        username: "submitted-user",
        name: "Submitted Sam",
        createdBy: "admin",
      });
    await services.enrollmentService.enrollStudent(
      courseA.id,
      submittedStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: testA.id,
      questionId: questionA.id,
      studentId: submittedStudent.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(
      testA.id,
      submittedStudent.id,
    );

    // Student 2 — NotStarted (no submission). Button must be absent.
    const notStartedStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-notstarted",
        username: "notstarted-user",
        name: "NotStarted Nina",
        createdBy: "admin",
      });
    await services.enrollmentService.enrollStudent(
      courseA.id,
      notStartedStudent.id,
      "admin",
    );

    // Student 3 — Graded AND already per-student released. Button must be
    // absent; indicator must be shown.
    const releasedStudent = await services.studentService.createStudentDocument(
      {
        authUserId: "auth-released",
        username: "released-user",
        name: "Released Rachel",
        createdBy: "admin",
      },
    );
    await services.enrollmentService.enrollStudent(
      courseA.id,
      releasedStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: testA.id,
      questionId: questionA.id,
      studentId: releasedStudent.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(
      testA.id,
      releasedStudent.id,
    );
    await services.gradeService.gradeQuestion({
      testId: testA.id,
      questionId: questionA.id,
      studentId: releasedStudent.id,
      score: 90,
      feedback: "Good",
      gradedBy: "admin",
    });
    await services.testSubmissionService.releaseGradeToStudent(
      testA.id,
      releasedStudent.id,
      "admin-1",
    );

    // Student 3b: Graded with an open redo. Her old grade is held, so no release.
    const redoStudent = await services.studentService.createStudentDocument({
      authUserId: "auth-redo",
      username: "redo-user",
      name: "Redo Rita",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      courseA.id,
      redoStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: testA.id,
      questionId: questionA.id,
      studentId: redoStudent.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(testA.id, redoStudent.id);
    await services.gradeService.gradeQuestion({
      testId: testA.id,
      questionId: questionA.id,
      studentId: redoStudent.id,
      score: 60,
      feedback: "Ok",
      gradedBy: "admin",
    });
    await services.redoRequestService.requestRedo(
      testA.id,
      redoStudent.id,
      "admin",
    );

    // Render once per student via ?studentId= so the detail pane focuses
    // the right one each time. The redesigned shell renders only the focused
    // student in the main pane, so per-student assertions need per-student
    // renders.
    const renderTestAFor = async (studentId: string) => {
      cleanup();
      const ui = await GradingPage({
        params: Promise.resolve({ courseId: courseA.id, testId: testA.id }),
        searchParams: Promise.resolve({ studentId }),
      });
      render(ui);
    };

    await renderTestAFor(submittedStudent.id);
    const submittedCard = await screen.findByTestId(
      `student-card-${submittedStudent.id}`,
    );
    await expectNoReleaseItem(submittedCard);

    await renderTestAFor(notStartedStudent.id);
    const notStartedCard = screen.getByTestId(
      `student-card-${notStartedStudent.id}`,
    );
    await expectNoReleaseItem(notStartedCard);

    await renderTestAFor(redoStudent.id);
    await expectNoReleaseItem(
      screen.getByTestId(`student-card-${redoStudent.id}`),
    );

    await renderTestAFor(releasedStudent.id);
    const releasedCard = screen.getByTestId(
      `student-card-${releasedStudent.id}`,
    );
    await userEvent.click(
      within(releasedCard).getByRole("button", { name: /more/i }),
    );
    expect(
      await screen.findByRole("menuitem", {
        name: /released to released rachel/i,
      }),
    ).toHaveAttribute("aria-disabled", "true");

    cleanup();

    // --- Test B: flag ON (global release scenario) -------------------------
    const courseB = await services.courseService.createCourse({
      title: "Course B",
      description: "",
      createdBy: "admin",
    });
    const testB = await services.testService.createTest(courseB.id, {
      title: "Test B",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: true,
    });
    const questionB = await services.questionService.addQuestion(testB.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin",
      type: "free_text",
    });

    // Student 4 — fully Graded but global flag is on. Per-student release is
    // moot, so the button must be absent.
    const globalFlagStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-globalflag",
        username: "globalflag-user",
        name: "GlobalFlag Greg",
        createdBy: "admin",
      });
    await services.enrollmentService.enrollStudent(
      courseB.id,
      globalFlagStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: testB.id,
      questionId: questionB.id,
      studentId: globalFlagStudent.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(
      testB.id,
      globalFlagStudent.id,
    );
    await services.gradeService.gradeQuestion({
      testId: testB.id,
      questionId: questionB.id,
      studentId: globalFlagStudent.id,
      score: 95,
      feedback: "Great",
      gradedBy: "admin",
    });

    const uiB = await GradingPage({
      params: Promise.resolve({ courseId: courseB.id, testId: testB.id }),
    });
    render(uiB);

    const globalFlagCard = await screen.findByTestId(
      `student-card-${globalFlagStudent.id}`,
    );
    await expectNoReleaseItem(globalFlagCard);
  });
});
