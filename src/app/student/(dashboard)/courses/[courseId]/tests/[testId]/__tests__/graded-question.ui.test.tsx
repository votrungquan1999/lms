// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradedQuestionShell } from "../graded-question.ui";

describe("GradedQuestionShell", () => {
  it("collapses by default when defaultOpen is false, showing the comment preview but hiding the body", () => {
    render(
      <GradedQuestionShell
        questionLabel="Question 1: Fibonacci"
        headerBadge={<span>100/100</span>}
        commentPreview="Nice clean recursion."
        defaultOpen={false}
      >
        <div>Graded answer detail</div>
      </GradedQuestionShell>,
    );

    expect(screen.getByText("Question 1: Fibonacci")).toBeInTheDocument();
    expect(screen.getByText("Nice clean recursion.")).toBeInTheDocument();
    expect(screen.queryByText("Graded answer detail")).not.toBeInTheDocument();
  });

  it("expands by default when defaultOpen is true, showing the body and not the collapsed comment preview", () => {
    render(
      <GradedQuestionShell
        questionLabel="Question 2: Reverse string"
        headerBadge={<span>60/100</span>}
        commentPreview="Off-by-one on the loop bound."
        defaultOpen={true}
      >
        <div>Graded answer detail</div>
      </GradedQuestionShell>,
    );

    expect(screen.getByText("Graded answer detail")).toBeInTheDocument();
    // The comment preview line only renders while collapsed.
    expect(
      screen.queryByText("Off-by-one on the loop bound."),
    ).not.toBeInTheDocument();
  });
});
