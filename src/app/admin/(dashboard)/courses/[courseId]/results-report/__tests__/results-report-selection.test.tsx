// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Student } from "src/lib/student-service";
import type { Test } from "src/lib/test-service";
import { describe, expect, it, vi } from "vitest";
import { ResultsReportSelectionProvider } from "../results-report-selection.state";
import {
  ExportButton,
  StudentChoiceList,
  TestChoiceList,
} from "../results-report-selection.ui";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function makeStudents(): Student[] {
  return [
    { id: "stu-alice", username: "alice", name: "Alice" },
    { id: "stu-bob", username: "bob", name: "Bob" },
  ];
}

function makeTests(): Test[] {
  const base = {
    courseId: "course-1",
    description: "",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
    timeLimitMinutes: null,
    isPractice: false,
    correctAnswersReleasedAt: null,
    gradesReleasedAt: null,
    createdAt: new Date(),
  };
  return [
    { ...base, id: "test-A", title: "Test A" },
    { ...base, id: "test-B", title: "Test B" },
    { ...base, id: "test-C", title: "Test C" },
  ];
}

/**
 * Renders the export view island the way the server page composes it.
 */
function renderView() {
  return render(
    <ResultsReportSelectionProvider
      courseId="course-1"
      students={makeStudents()}
      tests={makeTests()}
    >
      <StudentChoiceList />
      <TestChoiceList />
      <ExportButton />
    </ResultsReportSelectionProvider>,
  );
}

describe("results-report export view", () => {
  it("lists every enrolled student and course test as selectable options", () => {
    // Given the export view rendered with two students and three tests.
    renderView();

    // Then both students and all three tests are shown.
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Test A")).toBeInTheDocument();
    expect(screen.getByText("Test B")).toBeInTheDocument();
    expect(screen.getByText("Test C")).toBeInTheDocument();
  });

  it("navigates to the download route with the picked student and only the checked tests", async () => {
    // Given the export view.
    const user = userEvent.setup();
    push.mockClear();
    renderView();

    // When the admin picks Alice, checks tests A and C, then clicks Export.
    await user.click(screen.getByLabelText("Alice"));
    await user.click(screen.getByLabelText("Test A"));
    await user.click(screen.getByLabelText("Test C"));
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    // Then navigation targets the download route with Alice + A + C, not B.
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("/admin/courses/course-1/results-report/download");
    expect(url).toContain("studentId=stu-alice");
    expect(url).toContain("testId=test-A");
    expect(url).toContain("testId=test-C");
    expect(url).not.toContain("test-B");
  });

  it("hard-blocks Export until both a student and at least one test are selected", async () => {
    // Given the export view with nothing selected.
    const user = userEvent.setup();
    push.mockClear();
    renderView();
    const exportButton = screen.getByRole("button", { name: "Export PDF" });

    // Then Export is disabled and clicking it does not navigate.
    expect(exportButton).toBeDisabled();
    await user.click(exportButton);
    expect(push).not.toHaveBeenCalled();

    // And selecting only a student keeps it disabled.
    await user.click(screen.getByLabelText("Alice"));
    expect(exportButton).toBeDisabled();

    // When the admin also selects at least one test, Export becomes enabled.
    await user.click(screen.getByLabelText("Test A"));
    expect(exportButton).toBeEnabled();
  });
});
