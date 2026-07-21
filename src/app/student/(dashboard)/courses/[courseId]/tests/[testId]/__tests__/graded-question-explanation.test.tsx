// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import type { Grade } from "src/lib/grade-service";
import type { SingleSelectQuestion } from "src/lib/question-service";
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
