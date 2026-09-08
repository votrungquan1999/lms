// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));
vi.mock("../actions", () => ({
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  releaseCorrectAnswersAction: vi.fn(),
  requestRedoAction: vi.fn(),
  releaseGradeForStudentAction: vi.fn(),
  saveAndJumpToNextAction: vi.fn(),
}));

interface SeedOptions {
  showCorrectAnswerAfterSubmit: boolean;
  alreadyReleased?: boolean;
}

async function renderGradingPageFor(opts: SeedOptions) {
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
    showCorrectAnswerAfterSubmit: opts.showCorrectAnswerAfterSubmit,
  });
  if (opts.alreadyReleased) {
    await services.testService.releaseCorrectAnswers(test.id, "admin-1");
  }

  const ui = await GradingPage({
    params: Promise.resolve({ courseId: course.id, testId: test.id }),
    searchParams: Promise.resolve({}),
  });
  render(ui);
}

const RELEASE_CONTROL = /release correct answers/i;

describe("Feature: the release-correct-answers control appears only when it is needed", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("offers the release when the teacher withheld correct answers", async () => {
    await renderGradingPageFor({ showCorrectAnswerAfterSubmit: false });

    expect(
      screen.getByRole("button", { name: RELEASE_CONTROL }),
    ).toBeInTheDocument();
  });

  it("does not offer it when correct answers already show automatically", async () => {
    await renderGradingPageFor({ showCorrectAnswerAfterSubmit: true });

    expect(
      screen.queryByRole("button", { name: RELEASE_CONTROL }),
    ).not.toBeInTheDocument();
  });

  it("does not offer it a second time once answers have been released", async () => {
    await renderGradingPageFor({
      showCorrectAnswerAfterSubmit: false,
      alreadyReleased: true,
    });

    expect(
      screen.queryByRole("button", { name: RELEASE_CONTROL }),
    ).not.toBeInTheDocument();
  });
});
