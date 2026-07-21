// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it, vi } from "vitest";
import {
  FreeTextQuestionGradeForm,
  McQuestionGradeForm,
} from "../grading-forms";

vi.mock("../actions", () => ({
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  requestRedoAction: vi.fn(),
  saveAndJumpToNextAction: vi.fn(),
}));

/**
 * Feature: MC Answer Visual Display on Grading Page
 * As an admin
 * I want to see a student's MC selection as visual badges
 * So that I can quickly see what they chose and whether it was correct
 */

const MC_OPTIONS = [
  { id: "opt-a", text: "Berlin", isCorrect: false },
  { id: "opt-b", text: "Paris", isCorrect: true },
  { id: "opt-c", text: "Rome", isCorrect: false },
];

const BASE_PROPS = {
  testId: "test-1",
  courseId: "course-1",
  questionId: "q-1",
  studentId: "student-1",
  questionTitle: "Capital of France?",
  questionOrder: 1,
  existingScore: null,
  existingFeedback: null,
  existingSolution: null,
};

describe("Feature: McQuestionGradeForm", () => {
  describe("Scenario: Student selected a correct option", () => {
    it("should render the selected option as a selected-correct chip (not a raw [MC] string)", () => {
      render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          selectedIds={["opt-b"]}
          options={MC_OPTIONS}
        />,
      );

      expect(screen.queryByText(/\[MC\]/)).not.toBeInTheDocument();
      const chip = screen.getByTestId("mc-chip-opt-b");
      expect(chip).toHaveTextContent("Paris");
      expect(chip).toHaveAttribute("data-state", "selected-correct");
    });
  });

  describe("Scenario: Student selected a wrong option", () => {
    it("should render the selected option as a selected-wrong chip", () => {
      render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          selectedIds={["opt-a"]}
          options={MC_OPTIONS}
        />,
      );

      const chip = screen.getByTestId("mc-chip-opt-a");
      expect(chip).toHaveTextContent("Berlin");
      expect(chip).toHaveAttribute("data-state", "selected-wrong");
    });
  });
});

describe("Feature: McQuestionGradeForm read-only display", () => {
  describe("Scenario: MC grading is read-only, keyed on the student's selection", () => {
    it("should hide the grade form controls and show 'Not answered — 0' when unanswered, or the real score when answered wrong", () => {
      // Given an MC question the student never answered (no selection)
      const { container: unanswered } = render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          selectedIds={[]}
          options={MC_OPTIONS}
        />,
      );

      // Then no editable grade form renders — MC is auto-graded, not manual
      expect(
        within(unanswered).queryByRole("spinbutton"),
      ).not.toBeInTheDocument();
      expect(
        within(unanswered).queryByRole("button", { name: /save/i }),
      ).not.toBeInTheDocument();
      expect(
        within(unanswered).getByText("Not answered — 0"),
      ).toBeInTheDocument();

      // Given the same question, this time answered wrong (real score 0)
      const { container: answeredWrong } = render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          existingScore={0}
          selectedIds={["opt-a"]}
          options={MC_OPTIONS}
        />,
      );

      // Then it shows the real score, not the "not answered" framing
      expect(
        within(answeredWrong).queryByText("Not answered — 0"),
      ).not.toBeInTheDocument();
      expect(within(answeredWrong).getByText(/score/i)).toHaveTextContent("0");

      // Given the rare answered-but-not-yet-auto-graded MC: the student DID
      // select an option, but no grade row exists (score null). The label is
      // keyed on the SELECTION, not on the null grade (R2) — so this must show
      // the score, NOT "Not answered — 0" (which a `score === null` key gives).
      const { container: answeredNoGrade } = render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          existingScore={null}
          selectedIds={["opt-a"]}
          options={MC_OPTIONS}
        />,
      );

      expect(
        within(answeredNoGrade).queryByText("Not answered — 0"),
      ).not.toBeInTheDocument();
      expect(within(answeredNoGrade).getByText(/score/i)).toBeInTheDocument();
    });
  });
});

describe("Feature: FreeTextQuestionGradeForm", () => {
  describe("Scenario: Student answered a free-text question", () => {
    it("should render the answer as plain text (no chips)", () => {
      render(
        <FreeTextQuestionGradeForm
          {...BASE_PROPS}
          answerText="A sample answer"
        />,
      );

      expect(screen.getByText("A sample answer")).toBeInTheDocument();
      expect(screen.queryByTestId(/mc-chip/)).not.toBeInTheDocument();
    });
  });

  describe("Scenario: Student has not answered", () => {
    it("should show 'No answer submitted' when answerText is null", () => {
      render(<FreeTextQuestionGradeForm {...BASE_PROPS} answerText={null} />);

      expect(screen.getByText("No answer submitted")).toBeInTheDocument();
    });
  });
});

describe("Feature: FreeTextQuestionGradeForm children slot", () => {
  describe("Scenario: AI suggestion panel is passed as children", () => {
    it("should render the children as a descendant of the question box (grade-card)", () => {
      render(
        <FreeTextQuestionGradeForm {...BASE_PROPS} answerText="A sample answer">
          <div data-testid="ai-suggestion-stub">AI suggestion content</div>
        </FreeTextQuestionGradeForm>,
      );

      const gradeCard = screen.getByTestId("grade-card");
      expect(
        within(gradeCard).getByTestId("ai-suggestion-stub"),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Student has no free-text answer", () => {
    // Guards the documented regression: the AI panel must keep showing even
    // when there is no current answer — children must sit OUTSIDE the
    // `answerText && ...` conditional.
    it("should still render the children inside the question box when answerText is null", () => {
      render(
        <FreeTextQuestionGradeForm {...BASE_PROPS} answerText={null}>
          <div data-testid="ai-suggestion-stub">AI suggestion content</div>
        </FreeTextQuestionGradeForm>,
      );

      const gradeCard = screen.getByTestId("grade-card");
      expect(
        within(gradeCard).getByTestId("ai-suggestion-stub"),
      ).toBeInTheDocument();
    });
  });
});

describe("Feature: InProgress confirm dialog", () => {
  describe("Scenario: Admin grades an InProgress student", () => {
    it("should show a confirm dialog before submitting; cancel aborts the form action, confirm proceeds", async () => {
      const user = userEvent.setup();
      render(
        <FreeTextQuestionGradeForm
          {...BASE_PROPS}
          answerText="partial"
          studentStatus={TestStatus.InProgress}
        />,
      );

      // Fill in the score so the form would normally submit
      const scoreInput = screen.getByLabelText(/Score/);
      await user.clear(scoreInput);
      await user.type(scoreInput, "80");

      // Click the gated submit button
      await user.click(screen.getByRole("button", { name: /Save Grade/i }));

      // Dialog should appear
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveTextContent(/hasn.?t submitted/i);

      // Cancel — form should not actually submit; dialog closes
      await user.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

      // Re-open and confirm — clicking Confirm dismisses the gating dialog
      // so the form can proceed (user-observable: dialog is gone).
      await user.click(screen.getByRole("button", { name: /Save Grade/i }));
      await user.click(
        await screen.findByRole("button", {
          name: /Submit Anyway|Confirm/i,
        }),
      );
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
