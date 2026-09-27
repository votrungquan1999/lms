// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Test } from "src/lib/test-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailQuestion } from "../grading-detail-question";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

const test = { id: "test-1" } as Test;

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: grader sees a blank free-text question in the per-question view", () => {
  it("shows 'No answer — counts as 0' with no grading form once the student has submitted", async () => {
    // Given a free-text question the student never answered, then submitted.
    const { questionService, testSubmissionService } = getTestServices();
    const question = await questionService.addQuestion("test-1", {
      title: "Explain recursion",
      content: "",
      createdBy: "admin-1",
      type: "free_text",
    });
    await testSubmissionService.submitTest("test-1", "student-1");

    // When the grader opens that question's grading pane.
    const ui = await GradingDetailQuestion({
      test,
      courseId: "course-1",
      questionId: question.id,
      students: [{ id: "student-1", name: "Stu", username: "stu" }],
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then the blank reads "counts as 0" and no editable form is offered —
    // this is the literal bug: the By-question view used to render a score
    // box on a blank it had no business scoring.
    expect(screen.getByText("No answer — counts as 0")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the stored score instead of 'counts as 0' when a blank question already has a grade from before this fix", async () => {
    // Given a free-text question left blank, but already graded (legacy
    // data from before blanks became read-only in this view).
    const { questionService, testSubmissionService, gradeService } =
      getTestServices();
    const question = await questionService.addQuestion("test-1", {
      title: "Explain recursion",
      content: "",
      createdBy: "admin-1",
      type: "free_text",
    });
    await testSubmissionService.submitTest("test-1", "student-1");
    await gradeService.gradeQuestion({
      testId: "test-1",
      questionId: question.id,
      studentId: "student-1",
      score: 50,
      feedback: "Partial credit for effort",
      gradedBy: "admin-1",
    });

    // When the grader opens that question's grading pane.
    const ui = await GradingDetailQuestion({
      test,
      courseId: "course-1",
      questionId: question.id,
      students: [{ id: "student-1", name: "Stu", username: "stu" }],
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then the stored score wins over the generic "counts as 0" line.
    expect(screen.getByText("No answer — scored 50")).toBeInTheDocument();
    expect(
      screen.queryByText("No answer — counts as 0"),
    ).not.toBeInTheDocument();
  });
});
