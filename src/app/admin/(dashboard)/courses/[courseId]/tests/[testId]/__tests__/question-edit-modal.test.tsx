// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SingleSelectQuestion } from "src/lib/question-service";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

const mockRequireAdminSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    requireAdminSession: (...args: unknown[]) =>
      mockRequireAdminSession(...args),
  }),
}));

/** Opens the Edit modal of the page's only editable question and returns the dialog. */
async function openEditModal(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  return screen.findByRole("dialog", { name: /edit question/i });
}

/**
 * Feature: A teacher edits a test question in an Edit modal
 * As a teacher
 * I want to change a question in a modal and see it updated in the preview
 * So that I edit without a long inline form on the page
 */
describe("Feature: Test question Edit modal", () => {
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

  it("opens an Edit question modal, saves a new title, closes, and the preview shows it", async () => {
    // Given: a test page with one free-text question
    const user = userEvent.setup();
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
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin",
    });
    const params = Promise.resolve({ courseId: course.id, testId: test.id });
    const { rerender } = render(await TestDetailPage({ params }));

    // When: the teacher opens Edit, retitles the question and saves
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /edit question/i,
    });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Explain universal gravitation");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the modal closes and the new title is stored
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated).toMatchObject({
      id: question.id,
      title: "Explain universal gravitation",
    });

    // And: once the page refreshes (revalidate is mocked) the preview shows it
    rerender(await TestDetailPage({ params }));
    expect(
      screen.getByText("Question 1: Explain universal gravitation"),
    ).toBeInTheDocument();
  });

  it("edits a picture-answer question's title, text and type", async () => {
    // Given: a picture-answer question
    const user = userEvent.setup();
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
      title: "Solve the integral",
      content: "Upload a photo of your handwritten solution.",
      createdBy: "admin",
      type: "image_answer",
    });
    const params = Promise.resolve({ courseId: course.id, testId: test.id });
    const { rerender } = render(await TestDetailPage({ params }));

    // When: the teacher opens Edit, rewrites it and turns it into a Single Select
    const dialog = await openEditModal();
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Which result is right?");
    const content = within(dialog).getByLabelText("Content (Markdown)");
    await user.clear(content);
    await user.type(content, "Pick one.");
    await user.click(
      within(dialog).getByRole("radio", { name: /^single select$/i }),
    );
    const options = within(dialog).getAllByPlaceholderText(/^Option \d$/);
    await user.type(options[0], "x + C");
    await user.click(
      within(dialog).getByRole("radio", { name: /mark option 1 correct/i }),
    );
    await user.type(options[1], "x");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the modal closes and the type, text and options are stored
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as SingleSelectQuestion[];
    expect(updated).toMatchObject({
      id: question.id,
      type: "single_select",
      title: "Which result is right?",
      content: "Pick one.",
    });
    expect(updated.options.map((o) => o.text)).toEqual(["x + C", "x"]);
    expect(updated.options.map((o) => o.isCorrect)).toEqual([true, false]);

    // And: the preview shows the new type in the card header
    rerender(await TestDetailPage({ params }));
    const header = screen
      .getByText("Question 1: Which result is right?")
      .closest('[data-slot="card-header"]');
    if (!(header instanceof HTMLElement)) throw new Error("Expected a header");
    expect(within(header).getByText("Single Select")).toBeInTheDocument();
  });
});
