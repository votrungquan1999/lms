// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { StudentStatusBadge } from "../student-status-badge";

describe("Feature: StudentStatusBadge", () => {
  it("should render label, icon, and a status-distinct color for each of the four statuses", () => {
    const cases = [
      { status: TestStatus.Submitted, label: "Submitted" },
      { status: TestStatus.InProgress, label: "In progress" },
      { status: TestStatus.NotStarted, label: "Not started" },
      { status: TestStatus.Graded, label: "Graded" },
    ];

    const renderedClasses = new Set<string>();

    for (const { status, label } of cases) {
      const { unmount } = render(<StudentStatusBadge status={status} />);

      const badge = screen.getByText(label).closest("[data-status]");
      expect(badge).not.toBeNull();
      expect(badge?.getAttribute("data-status")).toBe(status);

      // Icon present (svg from lucide-react)
      expect(badge?.querySelector("svg")).not.toBeNull();

      // Capture className so we can assert distinct colors below
      renderedClasses.add(badge?.className ?? "");

      unmount();
    }

    // Each of the four statuses must produce a different className signature
    // (proves color/style varies per status, not just the data-status attr)
    expect(renderedClasses.size).toBe(4);
  });
});
