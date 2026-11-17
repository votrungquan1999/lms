// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
});
