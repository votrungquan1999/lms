// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import type { Grade } from "src/lib/grade-service";
import type {
  FreeTextQuestion,
  ImageAnswerQuestion,
} from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GradedQuestion } from "../graded-question";

// Same convention as diff-viewer.test.tsx / page-answer-reveal-mode.test.tsx:
// assert the diff library's props, never its DOM — react-diff-viewer-continued
// computes its diff asynchronously, so unmocked DOM assertions are unreliable.
const { diffProps } = vi.hoisted(() => ({ diffProps: vi.fn() }));

vi.mock("react-diff-viewer-continued", () => ({
  default: (props: { oldValue: string; newValue: string }) => {
    diffProps(props);
    return null;
  },
}));

// Isolates the `not.toHaveBeenCalled()` assertions below from each other —
// without this, one test's call count leaks into the next test's check.
beforeEach(() => {
  diffProps.mockClear();
});

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

  it("diff mode: does not fall back to the question's referenceAnswer when grade.solution is absent (D10, component-level)", () => {
    // Given a free_text question with an authored referenceAnswer, graded
    // with no solution, rendered directly in diff mode — bypassing
    // page.tsx's referenceAnswer scrub so the component's own gate is what's
    // actually under test (a page-level test can't tell the two apart, since
    // the scrub already removes referenceAnswer before it reaches here).
    render(
      <GradedQuestion
        question={freeTextQuestion}
        studentAnswer={{ type: "free_text", text: "student's diff attempt" }}
        grade={gradeWithoutSolution}
        isMC={false}
        options={[]}
        mode="diff"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );
    // Then no comparison is ever constructed from the referenceAnswer
    expect(diffProps).not.toHaveBeenCalled();
  });
});

describe("GradedQuestion — opens by default when plain mode has a correct answer to show (E2)", () => {
  it("expands a full-marks card by default so the referenceAnswer fallback is visible without opening anything", () => {
    // Given a free_text question scored 100 — the AI grader omits grade.solution
    // on a perfect score, so the fallback to referenceAnswer is what plain mode
    // has to show. Before the fix, GradedQuestionShell's defaultOpen checked
    // only `score !== 100`, which collapsed this exact card.
    const { container } = render(
      <GradedQuestion
        question={freeTextQuestion}
        studentAnswer={{ type: "free_text", text: "student's own answer" }}
        grade={{ ...gradeWithoutSolution, score: 100 }}
        isMC={false}
        options={[]}
        mode="plain"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );

    // Then the correct answer is already in the DOM — the collapsible removes
    // its children entirely when closed, so this is direct proof the card
    // started open, not just that the fallback text exists somewhere.
    expect(within(container).queryByText("Correct Answer")).not.toBeNull();
    expect(
      within(container).queryByText("The authored model answer."),
    ).not.toBeNull();
  });

  it("collapses a full-marks card when neither disjunct of defaultOpen fires", () => {
    // Given a free_text question scored 100 in diff mode with no grade.solution:
    // showDiff is false (no solution to diff) and showCorrectAnswer is false
    // (not plain mode), so `defaultOpen`'s only live signal is `score !== 100`.
    // A mutation to `defaultOpen={true}` would pass every other test in this
    // file, since none of them assert the collapsed state.
    const { container } = render(
      <GradedQuestion
        question={freeTextQuestion}
        studentAnswer={{ type: "free_text", text: "student's own answer" }}
        grade={{ ...gradeWithoutSolution, score: 100 }}
        isMC={false}
        options={[]}
        mode="diff"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
      />,
    );

    // Then the "Your Answer" panel — which showDiff:false would render into
    // CollapsibleContent if the card were open — is absent, proving collapse.
    expect(within(container).queryByText("Your Answer")).toBeNull();
  });
});

describe("GradedQuestion — image_answer diff guard (D36)", () => {
  it("shows the student's own photos, not an empty diff comparison, when a teacher sets grade.solution on an image_answer question", () => {
    // Given an image_answer question with a teacher-written solution, in diff
    // mode — today's config for every pre-migration test (D7) and therefore
    // the common case this bug hits. `showDiff` leads with `!isMC`, which is
    // TRUE for image_answer, so it builds a comparison against the student's
    // (nonexistent) text instead of rendering their submitted photos.
    const { container } = render(
      <GradedQuestion
        question={imageQuestion}
        studentAnswer={{
          type: "image",
          mediaKeys: ["answers/student-1/p1.png"],
        }}
        grade={gradeWithSolutionOnImageQuestion}
        isMC={false}
        options={[]}
        mode="diff"
        correctAnswersVisible={true}
        testStatus={TestStatus.Graded}
        answerImages={[
          {
            key: "answers/student-1/p1.png",
            url: "https://files.example/p1.png",
          },
        ]}
      />,
    );

    // Then the student's own photo renders
    expect(within(container).getByRole("img")).toHaveAttribute(
      "src",
      "https://files.example/p1.png",
    );
    // And no comparison is built from the student's (nonexistent) answer text
    expect(diffProps).not.toHaveBeenCalled();
  });
});
