// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitAnswerAction } from "../actions";
import { AnswerForm } from "../answer-form";

vi.mock("../actions", () => ({ submitAnswerAction: vi.fn() }));
vi.mock("../answer-image-actions", () => ({
  requestAnswerImageUploadSlotsAction: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(submitAnswerAction).mockResolvedValue({
    success: true,
    message: "Answer submitted successfully",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Feature: Submit Answer is disabled until there is something to submit", () => {
  it("free text: disables Submit Answer when nothing has been typed", () => {
    // Given a free-text question with no prior answer
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="free_text"
        existingAnswer=""
      />,
    );

    // Then Submit Answer starts out disabled
    expect(
      screen.getByRole("button", { name: "Submit Answer" }),
    ).toBeDisabled();
  });

  it("free text: enables Submit Answer once non-blank text is typed", async () => {
    // Given a free-text question with no prior answer
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="free_text"
        existingAnswer=""
      />,
    );

    // When the student types an answer
    await user.type(
      screen.getByPlaceholderText("Type your answer here..."),
      "Paris",
    );

    // Then Submit Answer becomes enabled
    expect(screen.getByRole("button", { name: "Submit Answer" })).toBeEnabled();
  });

  it("free text: keeps Submit Answer disabled for whitespace-only text", async () => {
    // Given a free-text question with no prior answer
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="free_text"
        existingAnswer=""
      />,
    );

    // When the student types only spaces
    await user.type(
      screen.getByPlaceholderText("Type your answer here..."),
      "   ",
    );

    // Then Submit Answer stays disabled
    expect(
      screen.getByRole("button", { name: "Submit Answer" }),
    ).toBeDisabled();
  });

  it("MC: disables Submit Answer when nothing is ticked", () => {
    // Given a multi-select question with no prior selection
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="multi_select"
        options={[
          { id: "opt-1", text: "A", isCorrect: true },
          { id: "opt-2", text: "B", isCorrect: false },
        ]}
        existingSelectedIds={[]}
      />,
    );

    // Then Submit Answer starts out disabled
    expect(
      screen.getByRole("button", { name: "Submit Answer" }),
    ).toBeDisabled();
  });

  it("MC: enables Submit Answer once an option is ticked", async () => {
    // Given a multi-select question with no prior selection
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="multi_select"
        options={[
          { id: "opt-1", text: "A", isCorrect: true },
          { id: "opt-2", text: "B", isCorrect: false },
        ]}
        existingSelectedIds={[]}
      />,
    );

    // When the student ticks an option
    await user.click(screen.getByRole("checkbox", { name: "A" }));

    // Then Submit Answer becomes enabled
    expect(screen.getByRole("button", { name: "Submit Answer" })).toBeEnabled();
  });

  it("image: disables Submit Answer until a photo is selected", async () => {
    // Given an image-answer question with no prior submission
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="image_answer"
        existingImageCount={0}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Submit Answer" }),
    ).toBeDisabled();

    // When the student picks a photo
    const photo = new File(["x"], "work.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Your photos"), photo);

    // Then Submit Answer becomes enabled
    expect(screen.getByRole("button", { name: "Submit Answer" })).toBeEnabled();
  });
});

describe("Feature: a refused submit keeps what the student entered", () => {
  it("free text: keeps the typed answer on screen after a refusal", async () => {
    // Given a free-text question and a submit that will be refused
    const user = userEvent.setup();
    vi.mocked(submitAnswerAction).mockResolvedValue({
      success: false,
      message: "Time limit exceeded",
    });
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="free_text"
        existingAnswer=""
      />,
    );

    // When the student types and submits
    await user.type(
      screen.getByPlaceholderText("Type your answer here..."),
      "Paris",
    );
    await user.click(screen.getByRole("button", { name: "Submit Answer" }));
    await screen.findByText("Time limit exceeded");

    // Then the box still shows what was typed — read right after the
    // refusal, since retyping would append to whatever a reset left behind.
    expect(screen.getByPlaceholderText("Type your answer here...")).toHaveValue(
      "Paris",
    );
  });

  it("MC: keeps the ticked option visibly checked after a refusal", async () => {
    // Given a multi-select question and a submit that will be refused
    const user = userEvent.setup();
    vi.mocked(submitAnswerAction).mockResolvedValue({
      success: false,
      message: "Time limit exceeded",
    });
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="multi_select"
        options={[
          { id: "opt-1", text: "A", isCorrect: true },
          { id: "opt-2", text: "B", isCorrect: false },
        ]}
        existingSelectedIds={[]}
      />,
    );

    // When the student ticks an option and submits
    await user.click(screen.getByRole("checkbox", { name: "A" }));
    await user.click(screen.getByRole("button", { name: "Submit Answer" }));
    await screen.findByText("Time limit exceeded");

    // Then the tick is still visibly checked — read right after the
    // refusal, since a reset reverts the DOM tick while state keeps the pick.
    expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
  });
});

describe("Feature: re-opening a saved answer after Cancel discards the unsaved edit", () => {
  it("free text: re-clicking Edit Answer after Cancel shows the saved answer, not the discarded draft", async () => {
    // Given a free-text question with a saved answer
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="free_text"
        existingAnswer="Saved answer"
      />,
    );

    // When the student edits the box, cancels, then edits again
    await user.click(screen.getByRole("button", { name: "Edit Answer" }));
    const textarea = screen.getByPlaceholderText("Type your answer here...");
    await user.clear(textarea);
    await user.type(textarea, "Unsaved draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit Answer" }));

    // Then the box shows the saved answer, not the discarded draft
    expect(screen.getByPlaceholderText("Type your answer here...")).toHaveValue(
      "Saved answer",
    );
  });

  it("MC: clicking Cancel after changing picks shows the saved picks again, not the unsaved ones", async () => {
    // Given a multi-select question with a saved pick of option A
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="multi_select"
        options={[
          { id: "opt-1", text: "A", isCorrect: true },
          { id: "opt-2", text: "B", isCorrect: false },
        ]}
        existingSelectedIds={["opt-1"]}
      />,
    );

    // When the student edits, switches to option B, then cancels
    await user.click(screen.getByRole("button", { name: "Edit Answer" }));
    await user.click(screen.getByRole("checkbox", { name: "A" }));
    await user.click(screen.getByRole("checkbox", { name: "B" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Then the read-only view shows the saved pick (A), not the unsaved one (B)
    expect(screen.getByText("A")).toHaveClass("font-medium");
    expect(screen.getByText("B")).not.toHaveClass("font-medium");

    // And editing again starts from the saved pick, not the discarded one
    await user.click(screen.getByRole("button", { name: "Edit Answer" }));
    expect(screen.getByRole("checkbox", { name: "A" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "B" })).not.toBeChecked();
  });
});
