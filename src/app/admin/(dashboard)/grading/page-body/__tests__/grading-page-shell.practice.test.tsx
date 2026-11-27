// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradingMode } from "src/lib/grading-mode";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingPageShell } from "../grading-page-shell";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

/**
 * A practice test with one written question: Ann handed in (graded before the switch to practice), Ben is still writing, Cy has not started.
 * With `secondQuestion`, Ann also answered an ungraded Q2.
 */
async function seedPracticeTest(secondQuestion = false) {
  const s = getTestServices();
  const course = await s.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await s.testService.createTest(course.id, {
    title: "Practice quiz",
    description: "",
    createdBy: "admin",
    isPractice: true,
  });
  const question = await s.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const students = [];
  for (const [i, name] of ["Ann", "Ben", "Cy"].entries()) {
    const student = await s.studentService.createStudentDocument({
      authUserId: `auth-${i}`,
      username: name.toLowerCase(),
      name,
      createdBy: "admin",
    });
    await s.enrollmentService.enrollStudent(course.id, student.id, "admin");
    students.push(student);
  }
  const [ann, ben] = students;
  if (secondQuestion) {
    const q2 = await s.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q2",
      content: "Q2",
      createdBy: "admin",
    });
    await s.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: ann.id,
      answer: { type: "free_text", text: "Ann's second answer" },
    });
  }
  for (const student of [ann, ben]) {
    await s.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: `${student.name}'s answer` },
    });
  }
  await s.testSubmissionService.submitTest(test.id, ann.id);
  await s.gradeService.gradeQuestion({
    testId: test.id,
    questionId: question.id,
    studentId: ann.id,
    score: 80,
    feedback: "Good",
    gradedBy: "admin",
  });
  return { course, test };
}

describe("Feature: a practice test's grading screen shows answers only", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the chip instead of Release, no progress bar, and lists a graded-before student under Submitted", async () => {
    const { course, test } = await seedPracticeTest();

    const ui = await GradingPageShell({
      test,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      basePath: `/admin/grading/${test.id}`,
      selection: { mode: GradingMode.Student },
    });
    render(ui);

    const bar = screen.getByTestId("grading-top-bar");
    expect(
      within(bar).getByText("Practice · no grades released"),
    ).toBeInTheDocument();
    expect(
      within(bar).queryByText(/release/i, { selector: "button" }),
    ).toBeNull();
    expect(screen.queryByTestId("grading-progress-fraction")).toBeNull();
    expect(screen.getByTestId("grading-student-position")).toHaveTextContent(
      "1 of 1 submitted",
    );
    expect(screen.getByText("Ann's answer")).toBeInTheDocument();
    expect(screen.queryByTestId("grade-card")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Submitted · 1")).toBeInTheDocument();
    expect(within(menu).getByText("Still writing · 1")).toBeInTheDocument();
    expect(within(menu).queryByText("asks first")).toBeNull();
    expect(within(menu).getByText("Not started · 1")).toBeInTheDocument();
    expect(within(menu).queryByText("Graded · 1")).toBeNull();
    expect(within(menu).queryByText(/next waiting student/i)).toBeNull();
  });

  it("opens the first submitted student on Q1, whatever grades her answers hold", async () => {
    const { course, test } = await seedPracticeTest(true);

    const ui = await GradingPageShell({
      test,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      basePath: `/admin/grading/${test.id}`,
      selection: { mode: GradingMode.Student },
    });
    render(ui);

    expect(screen.getByText("Ann's answer")).toBeInTheDocument();
    expect(screen.queryByText("Ann's second answer")).toBeNull();
  });
});
