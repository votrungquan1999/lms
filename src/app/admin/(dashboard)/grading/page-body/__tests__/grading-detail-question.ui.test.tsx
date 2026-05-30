// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CollapsibleQuestionDescription } from "../grading-detail-question.ui";

/**
 * Feature: Collapsible question description in the grading view
 *
 * As a grader
 * I want the focused question's description collapsed by default with a toggle
 * So that long descriptions don't crowd the per-student grading rows.
 */
describe("Feature: CollapsibleQuestionDescription", () => {
  it("given a description, when first rendered, then it is collapsed — the toggle reads 'View more' and the description is not shown", () => {
    // Given/When: rendered with a description.
    render(
      <CollapsibleQuestionDescription description="A long question description." />,
    );

    // Then: toggle reads "View more" and the description region is hidden
    // (Radix CollapsibleContent keeps it mounted with the `hidden` attribute
    // when closed, so we assert it is not visible to the grader).
    expect(
      screen.getByRole("button", { name: /view more/i }),
    ).toHaveTextContent("View more");
    expect(
      screen.getByTestId("question-description-content"),
    ).not.toBeVisible();
  });

  it("given the collapsed description, when the toggle is clicked, then it expands and the toggle reads 'Show less'; clicking again re-collapses it", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleQuestionDescription description="A long question description." />,
    );

    const toggle = screen.getByRole("button", { name: /view more|show less/i });
    const region = screen.getByTestId("question-description-content");

    // When: the grader clicks "View more".
    await user.click(toggle);

    // Then: the description is shown and the toggle reads "Show less".
    expect(region).toBeVisible();
    expect(toggle).toHaveTextContent("Show less");

    // When: clicked again.
    await user.click(toggle);

    // Then: it re-collapses and the toggle reads "View more".
    expect(region).not.toBeVisible();
    expect(toggle).toHaveTextContent("View more");
  });

  it("given an empty description, when rendered, then no toggle and no description region are shown", () => {
    render(<CollapsibleQuestionDescription description="" />);

    expect(
      screen.queryByRole("button", { name: /view more|show less/i }),
    ).toBeNull();
    expect(screen.queryByTestId("question-description-content")).toBeNull();
  });
});
