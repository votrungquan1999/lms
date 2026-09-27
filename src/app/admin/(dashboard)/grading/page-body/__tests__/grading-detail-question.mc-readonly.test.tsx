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

describe("Feature: grader sees MC answers as read-only in the per-question view", () => {
  it("should render the read-only score display (no CompactGradeForm inputs) and show 'No answer submitted' for an MC question the student has not yet submitted", async () => {
    // Given an unanswered, not-yet-submitted single_select question
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Capital of France?",
        content: "",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Berlin", isCorrect: false },
          { text: "Paris", isCorrect: true },
        ],
      },
    );

    // When the grader opens that question's grading pane
    const ui = await GradingDetailQuestion({
      test,
      courseId: "course-1",
      questionId: question.id,
      students: [{ id: "student-1", name: "Stu", username: "stu" }],
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then no editable grade form renders for the MC row
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save/i }),
    ).not.toBeInTheDocument();

    // And the blank reads the same pre-submit wording as free text and
    // image — it is not counted as 0 until the student submits.
    expect(screen.getByText("No answer submitted")).toBeInTheDocument();
    expect(screen.queryByText(/counts as 0/)).not.toBeInTheDocument();
  });

  it("should show 'No answer — counts as 0' for a blank MC question once the student has submitted, the same wording as free text and image", async () => {
    // Given a single_select question the student submitted having left blank.
    const services = getTestServices();
    const question = await services.questionService.addQuestion("test-1", {
      title: "Capital of France?",
      content: "",
      createdBy: "admin-1",
      type: "single_select",
      options: [
        { text: "Berlin", isCorrect: false },
        { text: "Paris", isCorrect: true },
      ],
    });
    await services.testSubmissionService.submitTest("test-1", "student-1");

    // When the grader opens that question's grading pane
    const ui = await GradingDetailQuestion({
      test,
      courseId: "course-1",
      questionId: question.id,
      students: [{ id: "student-1", name: "Stu", username: "stu" }],
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then the blank reads the same wording as a blank free-text/image
    // question, and the pre-submit wording is gone.
    expect(screen.getByText("No answer — counts as 0")).toBeInTheDocument();
    expect(screen.queryByText("No answer submitted")).not.toBeInTheDocument();
  });
});
