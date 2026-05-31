// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../empty-state.ui";

describe("Feature: EmptyState renders title and message", () => {
  it("should show the provided title and message text", () => {
    render(
      <EmptyState
        icon={BookOpen}
        title="No courses yet"
        message="You are not enrolled in any courses."
      />,
    );

    expect(screen.getByText("No courses yet")).toBeInTheDocument();
    expect(
      screen.getByText("You are not enrolled in any courses."),
    ).toBeInTheDocument();
  });
});
