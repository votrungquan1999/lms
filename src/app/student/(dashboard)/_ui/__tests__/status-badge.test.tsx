// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../status-badge.ui";

describe("Feature: StatusBadge maps test status to label and color variant", () => {
  it("should render each status with its label and semantic Badge variant", () => {
    const cases = [
      {
        status: TestStatus.NotStarted,
        label: "Not Started",
        variant: "outline",
      },
      {
        status: TestStatus.InProgress,
        label: "In Progress",
        variant: "warning",
      },
      { status: TestStatus.Submitted, label: "Submitted", variant: "info" },
      { status: TestStatus.Graded, label: "Graded", variant: "success" },
    ];

    for (const { status, label, variant } of cases) {
      const { unmount } = render(<StatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge.getAttribute("data-variant")).toBe(variant);
      unmount();
    }
  });
});
