// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingVariantPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));
vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({
    setTestFeedbackAction: vi.fn(),
    releaseGradesAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndNextAction: vi.fn(),
  }),
);

/** Seeds one free-text question and returns helpers to add students in each state. */
async function seedTest() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Midterm",
    description: "",
    createdBy: "admin",
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  async function addStudent(
    name: string,
    state:
      | "graded"
      | "waiting"
      | "writing"
      | "started-blank"
      | "redo"
      | "not-started",
  ) {
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${name}`,
      username: name.toLowerCase(),
      name,
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    if (state === "started-blank") {
      await services.testStartService.recordStart(
        test.id,
        student.id,
        new Date(),
      );
    }
    if (state !== "not-started" && state !== "started-blank") {
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: `${name} answer` },
      });
    }
    if (
      state !== "writing" &&
      state !== "started-blank" &&
      state !== "not-started"
    ) {
      await services.testSubmissionService.submitTest(test.id, student.id);
      // Hand-ins must differ in time for the oldest-first order to be decidable.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (state === "graded") {
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        score: 80,
        feedback: "ok",
        gradedBy: "admin",
      });
    }
    if (state === "redo") {
      await services.redoRequestService.requestRedo(
        test.id,
        student.id,
        "admin",
      );
    }
    return student;
  }
  return { test, addStudent };
}

describe("Feature: the student picker", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("is a dropdown in the top bar that groups students as Needs grading (oldest hand-in first), Graded, Still writing, Redo requested and Not started, with no roster beside the answer", async () => {
    // Given students in every state; Zed handed in before Amy, and Bea is graded
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Amy", "waiting");
    await addStudent("Bea", "graded");
    await addStudent("Cal", "writing");
    await addStudent("Dot", "redo");
    await addStudent("Eve", "not-started");

    // When the teacher opens the grading page and the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    expect(screen.queryAllByTestId(/^roster-cell-/)).toHaveLength(0);
    await userEvent.click(
      within(screen.getByTestId("grading-top-bar")).getByRole("button", {
        name: /student picker/i,
      }),
    );

    // Then each group has its header and its students, Needs grading oldest first
    const menu = await screen.findByRole("menu");
    const lines = [
      ...menu.querySelectorAll(
        '[data-slot="dropdown-menu-label"], [role="menuitem"]',
      ),
    ].map((el) => el.textContent?.trim());
    expect(lines).toEqual([
      "Needs grading · 2",
      expect.stringContaining("Zed"),
      expect.stringContaining("Amy"),
      "Graded · 1",
      expect.stringContaining("Bea"),
      "Still writing · 1",
      expect.stringContaining("Cal"),
      "Redo requested · 1",
      expect.stringContaining("Dot"),
      "Not started · 1",
      expect.stringContaining("Eve"),
    ]);
  });

  it("links every student who has work to open for, shows how much is saved or left, and lists a not-started student without a link", async () => {
    // Given a waiting student, a still-writing student with her one answer saved, and a not-started student
    const { test, addStudent } = await seedTest();
    const zed = await addStudent("Zed", "waiting");
    await addStudent("Cal", "writing");
    await addStudent("Eve", "not-started");

    // When the teacher opens the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");

    // Then the waiting student shows what is left and links to her
    const zedItem = within(menu).getByRole("menuitem", { name: /Zed/ });
    expect(zedItem).toHaveTextContent("1 left");
    expect(zedItem).toHaveAttribute(
      "href",
      expect.stringContaining(`studentId=${zed.id}`),
    );
    // And the still-writing student shows her saved answers
    expect(
      within(menu).getByRole("menuitem", { name: /Cal/ }),
    ).toHaveTextContent("1 of 1 saved");
    // And the not-started student is listed but cannot be opened
    expect(within(menu).getByRole("menuitem", { name: /Eve/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("Feature: a still-writing student with nothing saved", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("is listed as nothing saved yet and cannot be opened", async () => {
    // Given a student who started the test and saved no answer
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Sam", "started-blank");

    // When the teacher opens the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");

    // Then her row says nothing is saved, and it is disabled with no link
    const row = within(menu).getByRole("menuitem", { name: /Sam/ });
    expect(row).toHaveTextContent("nothing saved yet");
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).not.toHaveAttribute("href");
  });
});
