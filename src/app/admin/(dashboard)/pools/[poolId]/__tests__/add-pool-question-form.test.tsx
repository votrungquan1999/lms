// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { addPoolQuestionAction } from "../../pool-question-actions";
import { AddPoolQuestionForm } from "../add-pool-question-form";

vi.mock("../../pool-question-actions", () => ({
  addPoolQuestionAction: vi.fn(),
}));

vi.mock(
  "../../../courses/[courseId]/tests/[testId]/question-media-actions",
  () => ({
    requestUploadSlotsAction: vi.fn(),
  }),
);

/**
 * Feature: Add Pool Question Form
 * As an admin
 * I want a form to author questions inside a pool
 * So that I can build a reusable question bank.
 */

describe("Feature: Add Pool Question Form", () => {
  it("displays title field, content textarea, and submit button", () => {
    render(<AddPoolQuestionForm poolId="pool-1" />);

    expect(screen.getByLabelText("Question Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Content (Markdown)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Question" }),
    ).toBeInTheDocument();
  });

  it("reveals the MC options builder when a select type is chosen", async () => {
    const user = userEvent.setup();
    render(<AddPoolQuestionForm poolId="pool-1" />);

    await user.click(screen.getByRole("button", { name: /single select/i }));

    expect(screen.getByPlaceholderText("Option 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Option 2")).toBeInTheDocument();
  });

  it("does not invoke the add action when the title is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(addPoolQuestionAction).mockClear();
    render(<AddPoolQuestionForm poolId="pool-1" />);

    await user.click(screen.getByRole("button", { name: "Add Question" }));

    expect(addPoolQuestionAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a success message after a question is added", async () => {
    const user = userEvent.setup();
    vi.mocked(addPoolQuestionAction).mockResolvedValue({
      success: true,
      message: "Question added to pool",
    });
    render(<AddPoolQuestionForm poolId="pool-1" />);

    await user.type(screen.getByLabelText("Question Title"), "Closures");
    await user.click(screen.getByRole("button", { name: "Add Question" }));

    expect(
      await screen.findByText("Question added to pool"),
    ).toBeInTheDocument();
  });
});
