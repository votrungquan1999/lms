// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MediaContentType, type Question } from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it, vi } from "vitest";
import { TestQuestionsSection } from "../test-questions-section";

vi.mock("../actions", () => ({
  submitAnswerAction: vi.fn(),
  submitTestAction: vi.fn(),
}));
vi.mock("../answer-image-actions", () => ({
  requestAnswerImageUploadSlotsAction: vi.fn(),
}));

const base = {
  testId: "test-1",
  createdAt: new Date("2026-01-01"),
  weight: 1,
  media: [],
};

const questions: Question[] = [
  {
    ...base,
    id: "q-free",
    order: 1,
    title: "Describe a cell",
    content: "| Part | Job |\n|------|-----|\n| Nucleus | Control |",
    type: "free_text",
    media: [
      {
        key: "k1",
        url: "https://fake-s3.local/get/k1",
        contentType: MediaContentType.PNG,
        order: 0,
      },
    ],
  },
  {
    ...base,
    id: "q-single",
    order: 2,
    title: "Capital",
    content: "Capital of France?",
    type: "single_select",
    mcGradingStrategy: "all_or_nothing",
    options: [
      { id: "s1", text: "Paris", isCorrect: true },
      { id: "s2", text: "Rome", isCorrect: false },
    ],
  },
  {
    ...base,
    id: "q-multi",
    order: 3,
    title: "Primes",
    content: "Pick the primes",
    type: "multi_select",
    mcGradingStrategy: "all_or_nothing",
    options: [
      { id: "m1", text: "Two", isCorrect: true },
      { id: "m2", text: "Four", isCorrect: false },
    ],
  },
  {
    ...base,
    id: "q-image",
    order: 4,
    title: "Show your work",
    content: "Photograph your working",
    type: "image_answer",
  },
];

/**
 * Finds one question's card by its heading.
 * @param title - The heading text, e.g. "Question 1: Capital".
 * @returns The card element.
 */
function cardOf(title: string): HTMLElement {
  return screen.getByText(title).closest('[data-slot="card"]') as HTMLElement;
}

describe("Feature: a student sees unanswered questions", () => {
  it("shows each card with its title, formatted content, pictures and the right answer control", () => {
    render(
      <TestQuestionsSection
        testId="test-1"
        courseId="course-1"
        schoolId="school-1"
        questions={questions}
        answerMap={new Map()}
        gradeMap={new Map()}
        answerImagesMap={new Map()}
        annotationsMap={new Map()}
        testStatus={TestStatus.InProgress}
        isSubmitted={false}
        hasActiveRedo={false}
        canAnswer
        correctAnswersVisible={false}
        gradesVisible={false}
        answerRevealModeMap={new Map()}
        isPractice={false}
        revealMap={new Map()}
        attemptCountMap={new Map()}
      />,
    );

    // Free text: numbered title, Markdown table, picture, textarea
    const free = within(cardOf("Question 1: Describe a cell"));
    expect(free.getByText("Question 1: Describe a cell")).toBeInTheDocument();
    expect(free.getByRole("table")).toBeInTheDocument();
    expect(free.getByRole("img")).toHaveAttribute(
      "src",
      "https://fake-s3.local/get/k1",
    );
    expect(
      free.getByPlaceholderText("Type your answer here..."),
    ).toBeInTheDocument();

    // Single select: radios with plain option labels
    const single = within(cardOf("Question 2: Capital"));
    expect(single.getByText("Question 2: Capital")).toBeInTheDocument();
    expect(single.getByRole("radio", { name: "Paris" })).not.toBeChecked();
    expect(single.getByRole("radio", { name: "Rome" })).toBeInTheDocument();

    // Multi select: checkboxes
    const multi = within(cardOf("Question 3: Primes"));
    expect(multi.getByRole("checkbox", { name: "Two" })).toBeInTheDocument();
    expect(multi.getByRole("checkbox", { name: "Four" })).toBeInTheDocument();

    // Image answer: photo picker
    const image = within(cardOf("Question 4: Show your work"));
    expect(image.getByLabelText("Your photos")).toHaveAttribute("type", "file");
  });
});
