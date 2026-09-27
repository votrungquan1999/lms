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

describe("Feature: this grading page shows when grades and correct answers were released", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  /**
   * Renders this route's grading page for a test with the given auto-show
   * settings, after both grades and correct answers have been released.
   * @param autoShow - Whether grades and correct answers show automatically.
   */
  async function renderAfterBothReleases(autoShow: boolean) {
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
      showGradeAfterSubmit: autoShow,
      showCorrectAnswerAfterSubmit: autoShow,
    });
    await services.testService.releaseGrades(test.id, "admin-1");
    await services.testService.releaseCorrectAnswers(test.id, "admin-1");

    render(
      await GradingPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
        searchParams: Promise.resolve({}),
      }),
    );
  }

  it("replaces both release buttons with a 'released at' line once each has been released", async () => {
    await renderAfterBothReleases(false);

    expect(
      screen.queryByRole("button", { name: /release grades/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RELEASE_CONTROL }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Grades released at /)).toBeInTheDocument();
    expect(
      screen.getByText(/^Correct answers released at /),
    ).toBeInTheDocument();
  });

  it("shows neither a button nor a release line while both auto-show settings are on", async () => {
    await renderAfterBothReleases(true);

    expect(
      screen.queryByRole("button", { name: /release grades/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RELEASE_CONTROL }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/released at/i)).not.toBeInTheDocument();
  });
});
