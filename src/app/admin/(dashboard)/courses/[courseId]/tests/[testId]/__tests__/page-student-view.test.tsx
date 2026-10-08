// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaContentType } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const LONG_CONTENT = `${"Read the passage carefully. ".repeat(10)}END-OF-CONTENT`;

/** Seeds a test with one question of each kind, renders the admin test page, flips to Student view and returns that region. */
async function openStudentViewOfSavedQuestions() {
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
    title: "Essay",
    content: LONG_CONTENT,
    referenceAnswer: "SECRET-MODEL-ANSWER",
    explanation: "SECRET-FREE-EXPLANATION",
    media: [
      {
        key: "q/essay.png",
        contentType: MediaContentType.PNG,
        order: 0,
        size: 10,
        fileName: "essay.png",
      },
    ],
    createdBy: "admin",
  });
  await services.questionService.addQuestion(test.id, {
    type: "single_select",
    title: "Capital",
    content: "Capital of France?",
    options: [
      { text: "Paris", isCorrect: true },
      { text: "Lyon", isCorrect: false },
    ],
    explanation: "SECRET-MC-EXPLANATION",
    createdBy: "admin",
  });
  await services.questionService.addQuestion(test.id, {
    type: "multi_select",
    title: "Primes",
    content: "Pick the primes",
    options: [
      { text: "Two", isCorrect: true },
      { text: "Three", isCorrect: true },
      { text: "Four", isCorrect: false },
    ],
    mcGradingStrategy: "all_or_nothing",
    createdBy: "admin",
  });
  const removed = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Removed",
    content: "Gone soon",
    createdBy: "admin",
  });
  await services.questionService.addQuestion(test.id, {
    type: "image_answer",
    title: "Sketch",
    content: "Draw it",
    createdBy: "admin",
  });

  // Soft-delete leaves a gap in saved orders; later questions keep their number
  await services.questionService.deleteQuestion(test.id, removed.id, "admin");

  render(
    await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Student view" }));
  return within(screen.getByRole("region", { name: "Student view" }));
}

/**
 * Feature: a teacher previews a test's saved questions as students see them
 * As a teacher on the test page
 * I want a Student view of every saved question
 * So that I can check wording, pictures and controls without the answer key.
 */
describe("Feature: test page Student view", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await teardownTestDb();
  });

  it("shows every saved question with its content, pictures and answer controls but no answer key", async () => {
    const student = await openStudentViewOfSavedQuestions();

    // Numbered headers, saved order
    expect(student.getByText("Question 1: Essay")).toBeInTheDocument();
    expect(student.getByText("Question 5: Sketch")).toBeInTheDocument();
    expect(student.queryByText(/^Question 4:/)).not.toBeInTheDocument();
    // Full content, not the teacher list's 200-character excerpt
    expect(student.getByText(/END-OF-CONTENT/)).toBeInTheDocument();
    // Picture of the first question rendered
    expect(student.getByRole("img")).toHaveAttribute(
      "src",
      "https://fake-s3.local/get/q/essay.png",
    );
    // Controls
    expect(
      student.getByPlaceholderText("Type your answer here..."),
    ).toBeInTheDocument();
    expect(student.getByRole("radio", { name: "Paris" })).toBeInTheDocument();
    expect(
      student.getByRole("checkbox", { name: "Three" }),
    ).toBeInTheDocument();
    expect(student.getByLabelText("Your photos")).toBeInTheDocument();
    // No answer key, no teacher chrome
    expect(student.queryByText(/\(correct\)/i)).not.toBeInTheDocument();
    expect(student.queryByText(/SECRET-/)).not.toBeInTheDocument();
    expect(student.queryByText(/Model answer/i)).not.toBeInTheDocument();
    expect(student.queryByText(/Explanation/i)).not.toBeInTheDocument();
    expect(
      student.queryByRole("button", { name: "Submit Answer" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the cards in saved order, with the deleted question's number skipped", async () => {
    const student = await openStudentViewOfSavedQuestions();

    expect(
      student
        .getAllByText(/^Question \d+:/)
        .map((element) => element.textContent),
    ).toEqual([
      "Question 1: Essay",
      "Question 2: Capital",
      "Question 3: Primes",
      "Question 5: Sketch",
    ]);
  });

  it("lists a picked photo locally without uploading it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const student = await openStudentViewOfSavedQuestions();

    await userEvent.upload(
      student.getByLabelText("Your photos"),
      new File(["png"], "my-work.png", { type: "image/png" }),
    );

    const picked = student.getByRole("list", { name: "Selected photos" });
    expect(within(picked).getByText("my-work.png")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows no Student view button on a test without questions", async () => {
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

    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    expect(screen.getByText(/No questions yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Student view" }),
    ).not.toBeInTheDocument();
  });
});
