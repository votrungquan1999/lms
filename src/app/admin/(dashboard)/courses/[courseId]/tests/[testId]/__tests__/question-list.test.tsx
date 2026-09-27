// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type FreeTextQuestion,
  MediaContentType,
  type Question,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";
import { QuestionList } from "../question-list";

const mockRequireAdminSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
  unstable_rethrow: vi.fn(),
}));
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

/** Builds a minimal single_select question, media-free, for the flag tests. */
function singleSelectQuestion(
  options: { text: string; isCorrect: boolean }[],
): SingleSelectQuestion {
  return {
    id: "q-1",
    testId: "test-1",
    title: "Pick the prime number",
    content: "Choose one.",
    order: 1,
    createdAt: new Date(0),
    weight: 1,
    media: [],
    type: "single_select",
    mcGradingStrategy: "all_or_nothing",
    options: options.map((o, i) => ({ id: `opt-${i}`, ...o })),
  };
}

/** Builds a minimal free_text question, media-free, for the read-visibility tests. */
function freeTextQuestion(
  overrides: Partial<FreeTextQuestion> = {},
): FreeTextQuestion {
  return {
    id: "q-1",
    testId: "test-1",
    title: "Describe photosynthesis",
    content: "Describe the process.",
    order: 1,
    createdAt: new Date(0),
    weight: 1,
    media: [],
    type: "free_text",
    ...overrides,
  };
}

/**
 * Feature: Question List media preview
 * As an admin editing a test
 * I want each question's media to show in the preview list
 * So that I can confirm the attachment renders before students see it
 */

describe("Feature: Question List media preview", () => {
  describe("Scenario: A question carries an image attachment", () => {
    it("should render the image using its resolved url", () => {
      // Setup — a question whose media already has a resolved (presigned) url
      const question: Question = {
        id: "q-1",
        testId: "test-1",
        title: "Q1: Arrays",
        content: "What does this diagram show?",
        order: 1,
        createdAt: new Date(0),
        weight: 1,
        type: "free_text",
        media: [
          {
            key: "media/questions/q-1/diagram.png",
            url: "https://s3.example/signed/diagram.png",
            contentType: MediaContentType.PNG,
            order: 0,
          },
        ],
      };

      // Action
      render(<QuestionList questions={[question]} courseId="course-1" />);

      // Assert — the attachment renders as an image pointing at the resolved url
      const image = screen.getByAltText("Question media 1");
      expect(image).toHaveAttribute(
        "src",
        "https://s3.example/signed/diagram.png",
      );
    });
  });

  describe("Scenario: an imported multiple-choice question has no correct option marked (D32/D44)", () => {
    it("shows a needs-answer-key flag", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: false },
      ]);

      render(<QuestionList questions={[question]} courseId="course-1" />);

      expect(screen.getByText(/needs an? answer key/i)).toBeInTheDocument();
    });

    it("does not show the flag once a correct option is marked", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ]);

      render(<QuestionList questions={[question]} courseId="course-1" />);

      expect(
        screen.queryByText(/needs an? answer key/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("Scenario: an imported multiple-choice question arrived with no options at all (D72)", () => {
    it("shows a needs-answer-options flag instead of needs-an-answer-key", () => {
      const question = singleSelectQuestion([]);

      render(<QuestionList questions={[question]} courseId="course-1" />);

      expect(screen.getByText(/needs answer options/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/needs an? answer key/i),
      ).not.toBeInTheDocument();
    });
  });
});

/**
 * Feature: A test with no questions yet still shows its "Questions (N)"
 * heading, styled like its sibling empty sections.
 */
describe("Feature: Question list always shows its heading, even when empty", () => {
  it("shows a 'Questions (0)' heading and non-centered empty text when there are no questions yet", () => {
    render(<QuestionList questions={[]} courseId="course-1" />);

    expect(
      screen.getByRole("heading", { name: "Questions (0)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no questions yet/i).className).toBe(
      "text-sm text-muted-foreground",
    );
  });
});

/**
 * Feature: A teacher can see what a question already holds (Step 19)
 * As a teacher who already wrote a question
 * I want its stored model answer, explanation and answer-reveal setting visible on its card
 * So that I know what I'm changing before I open the edit panel
 */
describe("Feature: Question read-visibility", () => {
  describe("Scenario: a free_text question already carries a model answer, explanation and reveal override", () => {
    it("shows the model answer, explanation and current answer-reveal setting", () => {
      const question = freeTextQuestion({
        referenceAnswer: "Plants convert light into chemical energy.",
        explanation: "Focus on the role of chlorophyll.",
        answerRevealMode: "plain",
      });

      render(<QuestionList questions={[question]} courseId="course-1" />);

      // Scoped to the read-only <p> summary — the same value also legitimately
      // appears as the editable field's defaultValue in the panel below it.
      expect(
        screen.getByText(/plants convert light into chemical energy/i, {
          selector: "p",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/focus on the role of chlorophyll/i, {
          selector: "p",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Plain")).toBeInTheDocument();
    });
  });

  describe("Scenario: a multiple-choice question already has options and a grading strategy", () => {
    it("shows the question's type, options with the correct one marked, and its grading strategy", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ]);

      render(<QuestionList questions={[question]} courseId="course-1" />);

      // Scoped to "Single choice" specifically — Step 28's type-switcher
      // control in the edit panel below also renders a "Single Select"
      // label, which a bare /single/i would ambiguously also match.
      expect(screen.getByText(/single choice/i)).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText(/7.*correct/i)).toBeInTheDocument();
      expect(screen.getByText(/all.or.nothing/i)).toBeInTheDocument();
    });
  });
});

/**
 * Feature: A teacher can see how many students have already answered a
 * question before they change anything about it (Step 23)
 */
describe("Feature: Question card shows the answered-student count", () => {
  describe("Scenario: three distinct students have answered a question", () => {
    it("shows the count on the question card", () => {
      const question = freeTextQuestion();

      render(
        <QuestionList
          questions={[question]}
          courseId="course-1"
          answeredCounts={new Map([[question.id, 3]])}
        />,
      );

      expect(
        screen.getByText(/3 students have answered this/i),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: nobody has answered a question yet", () => {
    it("shows no answered-count text on the card", () => {
      const question = freeTextQuestion();

      render(
        <QuestionList
          questions={[question]}
          courseId="course-1"
          answeredCounts={new Map()}
        />,
      );

      expect(
        screen.queryByText(/students? have answered this/i),
      ).not.toBeInTheDocument();
    });
  });
});

/**
 * Feature: the admin test page wires the real answered-student count into
 * the question list (Step 23) — proves `countAnsweredStudentsByQuestionIds`
 * is actually called with every question on the test and its result reaches
 * the rendered card, not just that the component can render a passed-in map.
 */
describe("Feature: Test detail page wires the answered-student count", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("counts a student's revised answer once, from the real database", async () => {
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
    const question = await services.questionService.addQuestion(test.id, {
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin",
    });

    // Same student revises their answer — append-only storage means two rows.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "free_text", text: "First attempt" },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "free_text", text: "Revised attempt" },
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    expect(
      screen.getByText(/1 student has answered this/i),
    ).toBeInTheDocument();
  });
});

/**
 * Feature: the admin test page header counts MC questions with fewer than
 * 2 options separately from the needs-an-answer-key count (Step 35 / D72).
 */
describe("Feature: Test detail page wires the needs-answer-options count", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a header count for questions missing options, distinct from the needs-an-answer-key count", async () => {
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

    // Zero options — this step's new defect.
    await services.questionService.addQuestion(
      test.id,
      {
        type: "single_select",
        title: "Q1",
        content: "Q1",
        options: [],
        createdBy: "admin",
      },
      { allowMissingAnswerKey: true },
    );
    // 2+ options, none correct — the pre-existing, distinct defect.
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

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    expect(
      screen.getByText("1 question needs answer options"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 question needs an answer key"),
    ).toBeInTheDocument();
  });
});

/**
 * Feature: A teacher deletes a question from a test, told what it does to
 * the marks of students who already answered it (Step 29 / D37/D47).
 */
describe("Feature: a teacher deletes a question from a test", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("removes the question from the test on confirm", async () => {
    const user = userEvent.setup();
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
    const question = await services.questionService.addQuestion(test.id, {
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    await user.click(screen.getByRole("button", { name: /delete question/i }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /^delete$/i,
      }),
    );

    // Wait on the rendered success message, not a direct DB poll — the
    // delete also writes a change-log row after the tombstone commits, and
    // a DB-only wait can observe the tombstone before that write settles,
    // racing this test's own teardown (which closes the DB connection).
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/deleted/i);
    });

    const remaining = await services.questionService.listQuestions(test.id);
    expect(remaining).toEqual([]);
    expect(question.id).toBeDefined();
  });

  it("names that affected students' scores will change (not go to zero) when the question has been answered", async () => {
    const user = userEvent.setup();
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Explain gravity",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin",
    });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "free_text", text: "My attempt" },
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    await user.click(screen.getByRole("button", { name: /delete question/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/change/i);
    expect(dialog).not.toHaveTextContent(/to zero/i);
  });

  it("shows a delete control for an image_answer question too, which has no edit panel", async () => {
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
      title: "Solve the integral",
      content: "Upload a photo of your handwritten solution.",
      createdBy: "admin",
      type: "image_answer",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    expect(
      screen.getByRole("button", { name: /delete question/i }),
    ).toBeInTheDocument();
  });
});
