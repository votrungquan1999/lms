// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));
vi.mock("../actions", () => ({
  setTestFeedbackAction: vi.fn(),
  releaseCorrectAnswersAction: vi.fn(),
  requestRedoAction: vi.fn(),
  saveAndNextAction: vi.fn(),
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
const RELEASE_MENU = /^release/i;

/** Opens Release ▾ (when there is one) and returns whether it offers the correct-answers entry. */
async function releaseMenuOffersCorrectAnswers() {
  const trigger = screen.queryByRole("button", { name: RELEASE_MENU });
  if (!trigger) return false;
  await userEvent.click(trigger);
  return screen.queryByRole("menuitem", { name: RELEASE_CONTROL }) !== null;
}

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

    expect(await releaseMenuOffersCorrectAnswers()).toBe(true);
  });

  it("does not offer it when correct answers already show automatically", async () => {
    await renderGradingPageFor({ showCorrectAnswerAfterSubmit: true });

    expect(await releaseMenuOffersCorrectAnswers()).toBe(false);
  });

  it("does not offer it a second time once answers have been released", async () => {
    await renderGradingPageFor({
      showCorrectAnswerAfterSubmit: false,
      alreadyReleased: true,
    });

    expect(await releaseMenuOffersCorrectAnswers()).toBe(false);
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

  it("shows Released with no menu once both have been released", async () => {
    await renderAfterBothReleases(false);

    expect(screen.getByTestId("release-state")).toHaveTextContent(/^Released$/);
    expect(
      screen.queryByRole("button", { name: RELEASE_MENU }),
    ).not.toBeInTheDocument();
  });

  it("shows Shown on submit with no menu while both auto-show settings are on", async () => {
    await renderAfterBothReleases(true);

    expect(screen.getByTestId("release-state")).toHaveTextContent(
      "Shown on submit",
    );
    expect(
      screen.queryByRole("button", { name: RELEASE_MENU }),
    ).not.toBeInTheDocument();
  });
});
