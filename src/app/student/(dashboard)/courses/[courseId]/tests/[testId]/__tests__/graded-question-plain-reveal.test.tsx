// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import type { Grade } from "src/lib/grade-service";
import type {
  FreeTextQuestion,
  ImageAnswerQuestion,
} from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { GradedQuestion } from "../graded-question";

const freeTextQuestion: FreeTextQuestion = {
  id: "q-1",
  testId: "test-1",
  title: "Explain something",
  content: "Explain something.",
  order: 1,
  createdAt: new Date("2026-01-01"),
  weight: 1,
  media: [],
  type: "free_text",
  referenceAnswer: "The authored model answer.",
};

// Score is non-100 so the card's collapsible starts open (see
// GradedQuestionShell's defaultOpen) and the panel is present in the DOM
// without needing to simulate a click — D34's real-world trigger is a
// 100% score omitting `solution`, but that's orthogonal to this fixture.
const gradeWithoutSolution: Grade = {
  id: "g-1",
  testId: "test-1",
  questionId: "q-1",
  studentId: "student-1",
  score: 80,
  feedback: "",
  solution: null,
  gradedAt: new Date("2026-01-02"),
};

const imageQuestion: ImageAnswerQuestion = {
  id: "q-2",
  testId: "test-1",
  title: "Upload your work",
  content: "Upload your work.",
  order: 2,
  createdAt: new Date("2026-01-01"),
  weight: 1,
  media: [],
  type: "image_answer",
};

const SOLUTION_ON_IMAGE_QUESTION =
  "Solution text that should never appear on an image question.";

// Simulates the pre-existing, out-of-scope bug where the admin grading UI
// lets a teacher set grade.solution on an image_answer question.
const gradeWithSolutionOnImageQuestion: Grade = {
  id: "g-2",
  testId: "test-1",
  questionId: "q-2",
  studentId: "student-1",
  score: 80,
  feedback: "",
  solution: SOLUTION_ON_IMAGE_QUESTION,
  gradedAt: new Date("2026-01-02"),
};

describe("GradedQuestion — plain-mode correct-answer panel", () => {
  it("falls back to the question's referenceAnswer when no grade.solution exists, and never shows on a non-free-text question (D34, free_text guard)", () => {
    // Given a free_text question graded with no solution
    const { container: fallbackContainer } = render(
      <GradedQuestion
        question={freeTextQuestion}
        studentAnswer={{ type: "free_text", text: "student's own answer" }}
        grade={gradeWithoutSolution}
        isMC={false}
        options={[]}
        mode="plain"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then the authored referenceAnswer is shown as the correct answer
    expect(
      within(fallbackContainer).queryByText("The authored model answer."),
    ).not.toBeNull();

    // Given an image_answer question carrying a teacher-written grade.solution
    const { container: imageContainer } = render(
      <GradedQuestion
        question={imageQuestion}
        studentAnswer={undefined}
        grade={gradeWithSolutionOnImageQuestion}
        isMC={false}
        options={[]}
        mode="plain"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then the new plain panel must not paint a bogus text block over the
    // annotation display — gated on question.type, never !isMC.
    expect(within(imageContainer).queryByText("Correct Answer")).toBeNull();
    expect(
      within(imageContainer).queryByText(SOLUTION_ON_IMAGE_QUESTION),
    ).toBeNull();
  });
});
