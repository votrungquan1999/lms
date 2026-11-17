// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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

/** Returns the card element holding the given "Question N: title" heading. */
function cardOf(heading: string): HTMLElement {
  const card = screen.getByText(heading).closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected a card for "${heading}"`);
  }
  return card;
}

/**
 * Feature: A teacher sees each test question as the student will see it
 * As a teacher reviewing a test
 * I want the full question plus its answer key and settings in a teacher strip
 * So that I can check what students get without opening an editor
 */
describe("Feature: Test question preview", () => {
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

  it("shows each question as the student card with the full text, a type label, the answer key and the header actions", async () => {
    // Given: a long free-text question and a multi-select one, one already answered
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
    const longContent = `${"Describe the process step by step. ".repeat(8)}FINAL-SENTENCE-MARKER`;
    const essay = await services.questionService.addQuestion(test.id, {
      title: "Essay on photosynthesis",
      content: longContent,
      createdBy: "admin",
      referenceAnswer: "Plants convert light into chemical energy.",
      explanation: "Focus on chlorophyll.",
      answerRevealMode: "diff",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Pick the primes",
      content: "Choose all that apply.",
      createdBy: "admin",
      type: "multi_select",
      mcGradingStrategy: "partial",
      options: [
        { text: "2", isCorrect: true },
        { text: "3", isCorrect: true },
        { text: "4", isCorrect: false },
      ],
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: essay.id,
      studentId: "student-1",
      answer: { type: "free_text", text: "My attempt" },
    });

    // When: the teacher opens the test page
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // Then: the free-text card reads like the student's card, untruncated
    const essayCard = within(cardOf("Question 1: Essay on photosynthesis"));
    expect(
      essayCard.getByText(/FINAL-SENTENCE-MARKER/, { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      essayCard.getByText(/plants convert light into chemical energy/i, {
        selector: "p",
      }),
    ).toBeInTheDocument();
    expect(
      essayCard.getByText(/focus on chlorophyll/i, { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      essayCard.getByText("1 student has answered this"),
    ).toBeInTheDocument();

    // And: the type label and Delete control sit in the card header beside the title
    const header = cardOf("Question 1: Essay on photosynthesis").querySelector(
      '[data-slot="card-header"]',
    );
    if (!(header instanceof HTMLElement)) throw new Error("Expected a header");
    expect(within(header).getByText("Free Text")).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: /delete question/i }),
    ).toBeInTheDocument();

    // And: the multi-select card shows its type, grading rule and keyed options
    const mcCard = within(cardOf("Question 2: Pick the primes"));
    expect(
      mcCard.getByText("Multi Select", { selector: "span" }),
    ).toBeInTheDocument();
    expect(mcCard.getByText(/^Grading:$/).closest("p")).toHaveTextContent(
      "Partial credit",
    );
    expect(mcCard.getByText(/^2 \(correct\)$/)).toBeInTheDocument();
    expect(mcCard.getByText(/^3 \(correct\)$/)).toBeInTheDocument();
    expect(mcCard.getByText("4")).toBeInTheDocument();
  });
});
