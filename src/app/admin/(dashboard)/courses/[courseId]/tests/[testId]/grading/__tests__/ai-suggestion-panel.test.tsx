/** biome-ignore-all lint/style/noNonNullAssertion: test fixture indexing */
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AiGradeSuggestion } from "src/lib/ai-grade-types";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { AiSuggestionPanel } from "../ai-suggestion-panel";
import { AutoGradeWithAiButton } from "../auto-grade-with-ai-button";

/**
 * Feature: AI Suggestion Panel for Admin Grading Page (Step 7)
 *
 * As a teacher
 * I want to expand a suggestion's history and pick a non-latest row to Apply
 * So that I can switch the official grade between any prior AI suggestion.
 */

function buildSuggestion(
  overrides: Partial<AiGradeSuggestion> = {},
): AiGradeSuggestion {
  return {
    id: "suggestion-default",
    testId: "test-1",
    questionId: "q-1",
    studentId: "student-1",
    score: 70,
    feedback: "default feedback",
    gradedAgainstAnswerId: "answer-1",
    model: "gemini-2.5-flash",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    regenerateReason: null,
    appliedAt: null,
    appliedBy: null,
    ...overrides,
  };
}

describe("Feature: AiSuggestionPanel history expansion (Step 7)", () => {
  it("given three suggestions newest-first and the history opened on first render, when the panel renders, then three rows are visible each with a stable data-suggestion-id attribute and an Apply button", () => {
    // Given: a panel populated with three suggestions, sorted newest-first.
    const suggestions: AiGradeSuggestion[] = [
      buildSuggestion({
        id: "sugg-latest",
        score: 95,
        feedback: "latest",
        generatedAt: new Date("2026-01-03T00:00:00Z"),
      }),
      buildSuggestion({
        id: "sugg-middle",
        score: 80,
        feedback: "middle",
        generatedAt: new Date("2026-01-02T00:00:00Z"),
        regenerateReason: "more strict",
      }),
      buildSuggestion({
        id: "sugg-oldest",
        score: 60,
        feedback: "oldest",
        generatedAt: new Date("2026-01-01T00:00:00Z"),
        appliedAt: new Date("2026-01-01T01:00:00Z"),
        appliedBy: "admin-1",
      }),
    ];

    // When: rendered with history expanded.
    render(
      <AiSuggestionPanel
        testId="test-1"
        courseId="course-1"
        studentId="student-1"
        questionId="q-1"
        suggestions={suggestions}
        defaultHistoryOpen={true}
      />,
    );

    // Then: exactly three rows are rendered, each with a stable data-suggestion-id.
    const rows = screen.getAllByTestId("ai-suggestion-row");
    expect(rows).toHaveLength(3);

    const ids = rows.map((row) => row.getAttribute("data-suggestion-id"));
    expect(ids).toEqual(["sugg-latest", "sugg-middle", "sugg-oldest"]);

    // Then: every row exposes its applied state via data-applied.
    const latestRow = rows[0]!;
    const middleRow = rows[1]!;
    const oldestRow = rows[2]!;
    expect(latestRow.getAttribute("data-applied")).toBe("false");
    expect(middleRow.getAttribute("data-applied")).toBe("false");
    expect(oldestRow.getAttribute("data-applied")).toBe("true");

    // Then: every row carries its own Apply submit button.
    for (const row of rows) {
      const applyButton = within(row).getByRole("button", { name: /apply/i });
      expect(applyButton).toBeInTheDocument();
    }

    // Then: the previously-applied row shows the "Applied" badge.
    expect(
      within(oldestRow).getByTestId("ai-suggestion-applied-badge"),
    ).toHaveTextContent(/applied/i);
  });
});

describe("Feature: AiSuggestionPanel per-question regenerate control (Step A3)", () => {
  it("given a panel for one question, when the panel renders and the regenerate trigger is clicked, then a dialog opens with a reason field and a hidden questionId input scoped to THIS question", () => {
    // Given: a panel for question q-42 with a single suggestion.
    const suggestions: AiGradeSuggestion[] = [
      buildSuggestion({ id: "sugg-1", questionId: "q-42", score: 80 }),
    ];

    render(
      <AiSuggestionPanel
        testId="test-1"
        courseId="course-1"
        studentId="student-1"
        questionId="q-42"
        suggestions={suggestions}
      />,
    );

    // Then: a per-question regenerate trigger lives inside this panel.
    const panel = screen.getByTestId("ai-suggestion-panel");
    const trigger = within(panel).getByTestId("ai-regenerate-question-trigger");
    expect(trigger).toBeInTheDocument();

    // When: the teacher opens it.
    fireEvent.click(trigger);

    // Then: a dialog exposes a Reason field for the regenerate justification.
    const reasonField = screen.getByLabelText(/reason/i);
    expect(reasonField).toBeInTheDocument();

    // Then: the form carries THIS question's id (pins per-question scope).
    // The Dialog portals into document.body, so query the document, not the
    // render container.
    const questionIdInput = document.querySelector<HTMLInputElement>(
      'input[name="questionId"]',
    );
    expect(questionIdInput).not.toBeNull();
    expect(questionIdInput!.value).toBe("q-42");
  });

  it("given the per-question regenerate control and the whole-submission auto-grade control rendered together, when both render, then each is present and independent (no regression to the whole-submission control)", () => {
    // Given: a panel (with its per-question regenerate trigger) and the
    // whole-submission Auto-grade button rendered side by side, as the
    // grading page composes them.
    const suggestions: AiGradeSuggestion[] = [
      buildSuggestion({ id: "sugg-1", questionId: "q-42" }),
    ];

    render(
      <div>
        <AutoGradeWithAiButton
          testId="test-1"
          courseId="course-1"
          studentId="student-1"
          status={TestStatus.Submitted}
          hasExistingSuggestions={false}
        />
        <AiSuggestionPanel
          testId="test-1"
          courseId="course-1"
          studentId="student-1"
          questionId="q-42"
          suggestions={suggestions}
        />
      </div>,
    );

    // Then: the whole-submission control still renders unchanged.
    expect(
      screen.getByRole("button", { name: /auto-grade with ai/i }),
    ).toBeInTheDocument();

    // Then: the per-question regenerate trigger renders inside the panel,
    // distinct from the whole-submission control.
    const panel = screen.getByTestId("ai-suggestion-panel");
    expect(
      within(panel).getByTestId("ai-regenerate-question-trigger"),
    ).toBeInTheDocument();
  });
});

describe("Feature: AiSuggestionPanel solution preview", () => {
  it("given a suggestion whose solution field is set, when the panel renders, then the row exposes a solution preview block containing the solution text; a sibling row with no solution renders no preview block", () => {
    const suggestions: AiGradeSuggestion[] = [
      buildSuggestion({
        id: "sugg-with-solution",
        score: 75,
        feedback: "ok",
        solution: "def total(nums):\n    return sum(nums)",
        generatedAt: new Date("2026-01-02T00:00:00Z"),
      }),
      buildSuggestion({
        id: "sugg-no-solution",
        score: 60,
        feedback: "legacy",
        generatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ];

    render(
      <AiSuggestionPanel
        testId="test-1"
        courseId="course-1"
        studentId="student-1"
        questionId="q-1"
        suggestions={suggestions}
        defaultHistoryOpen={true}
      />,
    );

    const rows = screen.getAllByTestId("ai-suggestion-row");
    const withSolution = rows.find(
      (r) => r.getAttribute("data-suggestion-id") === "sugg-with-solution",
    )!;
    const noSolution = rows.find(
      (r) => r.getAttribute("data-suggestion-id") === "sugg-no-solution",
    )!;

    const preview = within(withSolution).getByTestId("ai-suggestion-solution");
    expect(preview).toHaveTextContent("def total(nums):");
    expect(preview).toHaveTextContent("return sum(nums)");

    expect(
      within(noSolution).queryByTestId("ai-suggestion-solution"),
    ).toBeNull();
  });
});

describe("Feature: AiSuggestionPanel stale-suggestion badge (Step 8)", () => {
  it("given two suggestions where one was graded against an older answer and another against the latest answer, when the panel renders with the latest answer id, then only the older suggestion's row carries data-stale=true and shows a Stale badge", () => {
    // Given: two suggestions for the same question; A was graded against
    // the prior answer ("old-answer-1"), B was graded against the current
    // latest answer ("current-answer-1").
    const suggestions: AiGradeSuggestion[] = [
      buildSuggestion({
        id: "sugg-fresh-B",
        score: 88,
        feedback: "fresh",
        gradedAgainstAnswerId: "current-answer-1",
        generatedAt: new Date("2026-01-02T00:00:00Z"),
      }),
      buildSuggestion({
        id: "sugg-stale-A",
        score: 70,
        feedback: "stale",
        gradedAgainstAnswerId: "old-answer-1",
        generatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ];

    // When: rendered with history expanded and the latest answer id passed in.
    render(
      <AiSuggestionPanel
        testId="test-1"
        courseId="course-1"
        studentId="student-1"
        questionId="q-1"
        suggestions={suggestions}
        latestAnswerId="current-answer-1"
        defaultHistoryOpen={true}
      />,
    );

    const rows = screen.getAllByTestId("ai-suggestion-row");
    expect(rows).toHaveLength(2);

    const freshRow = rows.find(
      (r) => r.getAttribute("data-suggestion-id") === "sugg-fresh-B",
    )!;
    const staleRow = rows.find(
      (r) => r.getAttribute("data-suggestion-id") === "sugg-stale-A",
    )!;

    // Then: stale suggestion's row carries data-stale="true" and shows a Stale badge.
    expect(staleRow.getAttribute("data-stale")).toBe("true");
    expect(
      within(staleRow).getByTestId("ai-suggestion-stale-badge"),
    ).toHaveTextContent(/stale/i);

    // Then: fresh suggestion's row carries data-stale="false" and shows NO Stale badge.
    expect(freshRow.getAttribute("data-stale")).toBe("false");
    expect(
      within(freshRow).queryByTestId("ai-suggestion-stale-badge"),
    ).toBeNull();
  });
});
