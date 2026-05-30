import type { ReactElement } from "react";
import { isValidElement } from "react";
import {
  QuestionGradeStatus,
  type StudentResultsReport,
} from "src/lib/results-report-assembler";
import {
  ResultsReportDocument,
  renderResultsReportToBuffer,
} from "src/lib/results-report-pdf";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";

/**
 * Recursively collects every rendered text fragment from a React element tree,
 * so structural presence can be asserted without scraping binary PDF bytes.
 * @param node - A React node (element, string, number, array, or nullish).
 */
function collectText(node: unknown): string[] {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (isValidElement(node)) {
    const { children } = (node as ReactElement<{ children?: unknown }>).props;
    return collectText(children);
  }
  return [];
}

/**
 * A fully-assembled two-test report model for one student, with per-question
 * breakdowns covering a graded question and a pending one.
 */
function makeModel(): StudentResultsReport {
  return {
    student: { id: "s-1", username: "alice", name: "Alice" },
    tests: [
      {
        testId: "t-A",
        title: "Test A",
        score: 80,
        gradeStatus: QuestionGradeStatus.Graded,
        status: TestStatus.Graded,
        overallFeedback: "Great work on A",
        questions: [
          {
            questionId: "q-1",
            title: "Explain X",
            answer: ["My answer"],
            gradeStatus: QuestionGradeStatus.Graded,
            score: 8,
            feedback: "Good",
          },
        ],
      },
      {
        testId: "t-B",
        title: "Test B",
        score: null,
        gradeStatus: QuestionGradeStatus.Pending,
        status: TestStatus.Submitted,
        overallFeedback: null,
        questions: [
          {
            questionId: "q-2",
            title: "Capital of France?",
            answer: ["Paris"],
            gradeStatus: QuestionGradeStatus.Pending,
            score: null,
            feedback: null,
          },
        ],
      },
    ],
  };
}

describe("renderResultsReportToBuffer", () => {
  it("renders a multi-test report model to a non-empty PDF buffer", async () => {
    // Given a fully-assembled two-test report model.
    const model = makeModel();

    // When the renderer produces PDF output for the model.
    const buffer = await renderResultsReportToBuffer(model);

    // Then the output is a non-empty PDF (byte signature present, length > 0).
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("includes the student name and every selected test's title and question titles in the document tree", () => {
    // Given a two-test report model with per-question breakdowns.
    const model = makeModel();

    // When the document element tree is built.
    const text = collectText(ResultsReportDocument(model));

    // Then it surfaces the student and each selected test + question title.
    expect(text.some((t) => t.includes("Alice"))).toBe(true);
    expect(text).toContain("Test A");
    expect(text).toContain("Test B");
    expect(text).toContain("Explain X");
    expect(text).toContain("Capital of France?");
  });
});
