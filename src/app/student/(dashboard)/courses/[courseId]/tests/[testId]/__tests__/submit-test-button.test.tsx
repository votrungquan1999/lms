// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmitTestButton } from "../submit-test-button";

vi.mock("../actions", () => ({ submitTestAction: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("Feature: the submit confirmation reads naturally for one question", () => {
  it("reads 'You have answered the question.' for a one-question test", async () => {
    // Given a one-question test the student has fully answered
    const user = userEvent.setup();
    render(
      <SubmitTestButton
        testId="test-1"
        courseId="course-1"
        totalQuestions={1}
        answeredQuestions={1}
      />,
    );

    // When the student opens the submit confirmation
    await user.click(
      screen.getByRole("button", { name: "Submit Test for Grading" }),
    );

    // Then it reads the singular sentence, not "all 1 question"
    expect(
      screen.getByText(/You have answered the question\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/all 1 question/)).not.toBeInTheDocument();
  });

  it("reads 'You have answered all N questions.' for a multi-question test", async () => {
    // Given a 3-question test the student has fully answered
    const user = userEvent.setup();
    render(
      <SubmitTestButton
        testId="test-1"
        courseId="course-1"
        totalQuestions={3}
        answeredQuestions={3}
      />,
    );

    // When the student opens the submit confirmation
    await user.click(
      screen.getByRole("button", { name: "Submit Test for Grading" }),
    );

    // Then it reads the plural sentence
    expect(
      screen.getByText(/You have answered all 3 questions\./),
    ).toBeInTheDocument();
  });
});
