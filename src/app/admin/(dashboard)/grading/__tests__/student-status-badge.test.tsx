// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { StudentStatusBadge } from "../student-status-badge";

describe("Feature: StudentStatusBadge", () => {
  const cases: ReadonlyArray<{ status: TestStatus; label: string }> = [
    { status: TestStatus.Submitted, label: "Submitted" },
    { status: TestStatus.InProgress, label: "In progress" },
    { status: TestStatus.NotStarted, label: "Not started" },
    { status: TestStatus.Graded, label: "Graded" },
  ];

  for (const { status, label } of cases) {
    it(`renders the visible label "${label}" and exposes data-status="${status}" for the ${status} status`, () => {
      render(<StudentStatusBadge status={status} />);

      // User-observable label text is the source of truth for sighted users.
      const badge = screen.getByText(label).closest("[data-status]");
      expect(badge).not.toBeNull();

      // data-status is a stable semantic hook for assistive tech / tests so
      // each status is distinguishable beyond color/className.
      expect(badge?.getAttribute("data-status")).toBe(status);

      // The status icon (lucide svg) is rendered alongside the label.
      expect(badge?.querySelector("svg")).not.toBeNull();
    });
  }
});
