// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
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
const { releaseTestAction } = vi.hoisted(() => ({
  releaseTestAction: vi.fn(),
}));

vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({
    setTestFeedbackAction: vi.fn(),
    releaseTestAction,
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndNextAction: vi.fn(),
  }),
);

/**
 * A test with five students: Alice graded and already released, Bob and Dana
 * graded, Cy handed in but not graded, Eli not started.
 */
async function seedTest() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Algebra 101",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Midterm",
    description: "",
    createdBy: "admin",
    showGradeAfterSubmit: false,
    showCorrectAnswerAfterSubmit: false,
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const ids: Record<string, string> = {};
  for (const name of ["Alice", "Bob", "Cy", "Dana", "Eli"]) {
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${name}`,
      username: name.toLowerCase(),
      name,
      createdBy: "admin",
    });
    ids[name] = student.id;
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    if (name === "Eli") continue;
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: `${name}'s answer` },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    if (name === "Cy") continue;
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 90,
      feedback: "ok",
      gradedBy: "admin",
    });
  }
  await services.testSubmissionService.releaseGradeToStudent(
    test.id,
    ids.Alice,
    "admin",
  );
  return { test, ids };
}

/** Opens the release dialog from the top bar and switches it to chosen students. */
async function openChosenMode(testId: string) {
  render(await GradingVariantPage({ params: Promise.resolve({ testId }) }));
  await userEvent.click(screen.getByRole("button", { name: /^Release .+▾$/ }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /release grades/i }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Release grades · Midterm",
  });
  await userEvent.click(
    within(dialog).getByRole("radio", { name: /only chosen students/i }),
  );
  return dialog;
}

describe("Feature: the release dialog's Only chosen students checklist", () => {
  beforeEach(async () => {
    releaseTestAction.mockReset();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lets the teacher tick graded students and releases exactly those", async () => {
    // Given Bob and Dana graded, Alice already released, Cy waiting and Eli not started
    releaseTestAction.mockResolvedValue({ success: true, message: "" });
    const { test, ids } = await seedTest();
    const dialog = await openChosenMode(test.id);

    // Then Bob and Dana can be ticked, Alice is ticked and fixed, Cy and Eli are fixed unticked
    const box = (name: string) =>
      within(dialog).getByRole("checkbox", { name: new RegExp(name) });
    expect(box("Bob")).toBeEnabled();
    expect(box("Bob")).not.toBeChecked();
    expect(box("Alice")).toBeDisabled();
    expect(box("Alice")).toBeChecked();
    expect(box("Cy")).toBeDisabled();
    expect(box("Eli")).toBeDisabled();

    // When she ticks Bob and releases
    await userEvent.click(box("Bob"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Release to 1 student" }),
    );

    // Then one request carries only Bob
    expect(releaseTestAction).toHaveBeenCalledTimes(1);
    const form = releaseTestAction.mock.calls[0][1] as FormData;
    expect(form.get("mode")).toBe("chosen");
    expect(form.getAll("studentId")).toEqual([ids.Bob]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("narrows the list with search, ticks every graded student with Select all graded, and cannot release none", async () => {
    // Given the dialog in chosen mode with nobody ticked
    releaseTestAction.mockResolvedValue({ success: true, message: "" });
    const { test, ids } = await seedTest();
    const dialog = await openChosenMode(test.id);
    const release = () =>
      within(dialog).getByRole("button", { name: /^Release to / });
    expect(release()).toHaveTextContent("Release to 0 students");
    expect(release()).toBeDisabled();

    // When she searches for "bo"
    await userEvent.type(within(dialog).getByRole("searchbox"), "bo");

    // Then only Bob is listed
    expect(
      within(dialog).getByRole("checkbox", { name: /Bob/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("checkbox", { name: /Dana/ }),
    ).not.toBeInTheDocument();

    // When she picks Select all graded while the search is on
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Select all graded (2)" }),
    );

    // Then every graded student not yet released is ticked, not only the one shown
    expect(within(dialog).getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(release());
    const form = releaseTestAction.mock.calls[0][1] as FormData;
    expect(form.getAll("studentId")).toEqual([ids.Bob, ids.Dana]);
  });
});
