// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import type { Grade } from "src/lib/grade-service";
import type {
  FreeTextQuestion,
  SingleSelectQuestion,
} from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { GradedQuestion } from "../graded-question";

const EXPLANATION_TEXT = "4 is the sum of 2 and 2.";

const baseQuestion: SingleSelectQuestion = {
  id: "q-1",
  testId: "test-1",
  title: "What is 2 + 2?",
  content: "Pick the correct answer.",
  order: 1,
  createdAt: new Date("2026-01-01"),
  weight: 1,
  media: [],
  type: "single_select",
  options: [
    { id: "opt-1", text: "4", isCorrect: true },
    { id: "opt-2", text: "5", isCorrect: false },
  ],
  mcGradingStrategy: "all_or_nothing",
};

const baseFreeTextQuestion: FreeTextQuestion = {
  id: "q-2",
  testId: "test-1",
  title: "Explain photosynthesis",
  content: "Explain in your own words.",
  order: 2,
  createdAt: new Date("2026-01-01"),
  weight: 1,
  media: [],
  type: "free_text",
};

// Score is non-100 so the card's collapsible starts open (see
// GradedQuestionShell's defaultOpen) and the explanation panel is present
// in the DOM without needing to simulate a click.
const grade: Grade = {
  id: "g-1",
  testId: "test-1",
  questionId: "q-1",
  studentId: "student-1",
  score: 80,
  feedback: "",
  solution: null,
  gradedAt: new Date("2026-01-02"),
};

describe("GradedQuestion — MC explanation reveal", () => {
  it("shows the explanation only when correct answers are revealed, and never invents one", () => {
    // Given the gate is open and the question has an explanation
    const { container: openContainer } = render(
      <GradedQuestion
        question={{ ...baseQuestion, explanation: EXPLANATION_TEXT }}
        studentAnswer={undefined}
        grade={grade}
        isMC={true}
        options={baseQuestion.options}
        mode="diff"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then the explanation text is rendered
    expect(within(openContainer).queryByText(EXPLANATION_TEXT)).not.toBeNull();

    // Given the gate is closed for the same question/explanation
    const { container: closedContainer } = render(
      <GradedQuestion
        question={{ ...baseQuestion, explanation: EXPLANATION_TEXT }}
        studentAnswer={undefined}
        grade={grade}
        isMC={true}
        options={baseQuestion.options}
        mode="diff"
        correctAnswersVisible={false}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then the explanation text never enters the rendered output (not just hidden)
    expect(within(closedContainer).queryByText(EXPLANATION_TEXT)).toBeNull();

    // Given the gate is open but the question has no explanation
    const { container: noExplanationContainer } = render(
      <GradedQuestion
        question={baseQuestion}
        studentAnswer={undefined}
        grade={grade}
        isMC={true}
        options={baseQuestion.options}
        mode="diff"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then no explanation block renders
    expect(
      within(noExplanationContainer).queryByText("Explanation"),
    ).toBeNull();
  });
});

describe("GradedQuestion — free-text explanation reveal (parity with MC)", () => {
  it("shows the explanation when correct answers are revealed", () => {
    // Given the gate is open and the free-text question has an explanation
    const { container } = render(
      <GradedQuestion
        question={{ ...baseFreeTextQuestion, explanation: EXPLANATION_TEXT }}
        studentAnswer={undefined}
        grade={grade}
        isMC={false}
        options={[]}
        mode="plain"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then the explanation text is rendered
    expect(within(container).queryByText(EXPLANATION_TEXT)).not.toBeNull();
  });

  it("keeps the explanation out of the rendered output when correct answers are not revealed", () => {
    // Given the gate is closed for a free-text question with an explanation
    const { container } = render(
      <GradedQuestion
        question={{ ...baseFreeTextQuestion, explanation: EXPLANATION_TEXT }}
        studentAnswer={undefined}
        grade={grade}
        isMC={false}
        options={[]}
        mode="plain"
        correctAnswersVisible={false}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then the explanation text never enters the rendered output (not just hidden)
    expect(within(container).queryByText(EXPLANATION_TEXT)).toBeNull();
  });
});
