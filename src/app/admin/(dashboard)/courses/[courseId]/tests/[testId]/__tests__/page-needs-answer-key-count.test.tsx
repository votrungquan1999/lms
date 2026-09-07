// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

/**
 * Feature: the test page header flags questions needing an answer key
 * As an admin who imported questions with AI (D32)
 * I want a page-level count, not just a per-card badge
 * So that a keyless MC question isn't buried on a long question list (D44).
 */
describe("Feature: test page header — needs-answer-key count", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a count reflecting the real number of questions needing an answer key", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });

    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    // Two keyless MC questions (D32) — the page-level count should read 2.
    // 2+ options each: a single option is D72's separate "needs answer
    // options" defect, not this one.
    await services.questionService.addQuestion(
      test.id,
      {
        type: "single_select",
        title: "Q2",
        content: "Q2",
        options: [
          { text: "a", isCorrect: false },
          { text: "b", isCorrect: false },
        ],
        createdBy: "admin",
      },
      { allowMissingAnswerKey: true },
    );
    await services.questionService.addQuestion(
      test.id,
      {
        type: "multi_select",
        title: "Q3",
        content: "Q3",
        options: [
          { text: "a", isCorrect: false },
          { text: "b", isCorrect: false },
        ],
        mcGradingStrategy: "all_or_nothing",
        createdBy: "admin",
      },
      { allowMissingAnswerKey: true },
    );

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(
      screen.getByText("2 questions need an answer key"),
    ).toBeInTheDocument();
  });

  it("shows no count when every question already has a marked correct option", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });

    await services.questionService.addQuestion(test.id, {
      type: "single_select",
      title: "Q1",
      content: "Q1",
      options: [{ text: "a", isCorrect: true }],
      createdBy: "admin",
    });

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.queryByText(/needs? an answer key/i)).not.toBeInTheDocument();
  });
});
