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
  it("should render the read-only score display (no CompactGradeForm inputs) and show only 'Not answered — 0' for an unanswered MC question", async () => {
    // Given an unanswered single_select question
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

    // And only the single "Not answered — 0" line shows, not the generic one too
    expect(screen.getByText("Not answered — 0")).toBeInTheDocument();
    expect(
      screen.queryByText("No answer submitted (counts as 0)."),
    ).not.toBeInTheDocument();
  });
});
