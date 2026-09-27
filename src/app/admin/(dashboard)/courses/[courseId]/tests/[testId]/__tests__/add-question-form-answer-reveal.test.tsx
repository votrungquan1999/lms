// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FreeTextQuestion } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddQuestionForm } from "../add-question-form";

const mockRequireAdminSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    requireAdminSession: (...args: unknown[]) =>
      mockRequireAdminSession(...args),
  }),
}));

describe("Feature: Add Question Form — per-question answer-reveal override", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lets the teacher set one free_text question to depart from the test's own choice, while a question left untouched inherits it", async () => {
    const user = userEvent.setup();
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    // Seeded distinct from the override below only to prove the per-question
    // value persists independently; precedence resolution is the later
    // student-facing step, not this one.
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin-1",
      answerRevealMode: "diff",
    });

    render(<AddQuestionForm testId={test.id} courseId={course.id} />);

    // Given: writing a free_text question, the teacher picks "plainly" for
    // this one question — departing from the test's side-by-side default.
    await user.type(
      screen.getByLabelText("Question Title"),
      "Explain photosynthesis",
    );
    await user.click(
      screen.getByRole("radio", {
        name: /correct answer written out plainly/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add Question" }));
    // The success banner lives outside <form> and survives the remount, so it
    // is already on screen for the second submit — wait on the persisted
    // count instead, which can only be satisfied by this submission's write.
    await waitFor(async () => {
      expect(
        await services.questionService.listQuestions(test.id),
      ).toHaveLength(1);
    });

    // When: a second question is written without touching the control
    await user.type(screen.getByLabelText("Question Title"), "Explain gravity");
    await user.click(screen.getByRole("button", { name: "Add Question" }));
    await waitFor(async () => {
      expect(
        await services.questionService.listQuestions(test.id),
      ).toHaveLength(2);
    });

    // Then: the first question's override persists distinctly, and the
    // second inherits the test (stays undefined, not defaulted either way).
    const questions = (await services.questionService.listQuestions(
      test.id,
    )) as FreeTextQuestion[];
    expect(questions).toHaveLength(2);
    const [withOverride, withoutOverride] = questions;
    expect(withOverride.answerRevealMode).toBe("plain");
    expect(withoutOverride.answerRevealMode).toBeUndefined();
  });

  it("hides the answer-reveal control once the question type is no longer free_text", async () => {
    const user = userEvent.setup();
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin-1",
    });

    render(<AddQuestionForm testId={test.id} courseId={course.id} />);

    await user.click(screen.getByRole("button", { name: /single select/i }));

    expect(
      screen.queryByRole("radio", {
        name: /correct answer written out plainly/i,
      }),
    ).not.toBeInTheDocument();
  });
});
