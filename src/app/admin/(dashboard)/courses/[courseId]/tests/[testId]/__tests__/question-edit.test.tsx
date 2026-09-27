// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  FreeTextQuestion,
  MultiSelectQuestion,
  SingleSelectQuestion,
} from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";
import { QuestionEditPanel } from "../question-edit.state";

const mockRequireAdminSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
  // `with-span` calls this on every thrown error; without it a real failure
  // surfaces as a confusing missing-export error instead of its own message.
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

/**
 * Feature: A teacher sees what a question holds and changes how it shows its
 * answer (Step 19) — without deleting the question and writing it again.
 */
describe("Feature: Question edit panel — answer-reveal override", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("switches a free_text question's answer-reveal override away from inheriting the test", async () => {
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
      answerRevealMode: "plain",
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

    // Given: the question has no override yet — it inherits the test's
    // default. Scoped by id — the Add Question form on this same page
    // shares the exact "Use the test's setting" wording.
    const inheritRadio = document.getElementById(
      `reveal-inherit-${question.id}`,
    );
    if (!inheritRadio) throw new Error("Expected the inherit radio to exist");
    expect(inheritRadio).toBeChecked();

    // When: the teacher switches this one question to side-by-side and saves.
    // Scoped by id — the test settings panel on this same page now shares
    // the exact "Side-by-side comparison" wording.
    const diffRadio = document.getElementById(`reveal-diff-${question.id}`);
    if (!diffRadio) throw new Error("Expected the diff radio to exist");
    await user.click(diffRadio);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    // Then: the override is persisted, distinct from the test's own "plain" default
    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated).toMatchObject({
      id: question.id,
      answerRevealMode: "diff",
    });
  });

  it("uses the same answer-display heading and option wording as the test settings panel", async () => {
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

    // Rendered alone: on the full page the settings panel and Add Question
    // share this wording, which would make the queries ambiguous.
    render(
      <QuestionEditPanel
        question={question}
        courseId={course.id}
        answeredCount={0}
      />,
    );

    expect(
      screen.getByText("How students see their answer"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Use the test's setting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Side-by-side comparison" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "Correct answer written out plainly",
      }),
    ).toBeInTheDocument();
  });

  it("clears an answer-reveal override when the teacher picks 'Use the test's setting'", async () => {
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
      answerRevealMode: "diff",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    const inheritRadio = document.getElementById(
      `reveal-inherit-${question.id}`,
    );
    if (!inheritRadio) throw new Error("Expected the inherit radio to exist");
    await user.click(inheritRadio);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated).toMatchObject({
      id: question.id,
      answerRevealMode: undefined,
    });
  });
});

/**
 * The admin page also renders `AddQuestionForm`, which has its own "Model
 * Answer"/"Explanation" fields (default type free_text) — so plain
 * `getByLabelText` on those labels is ambiguous on this page. The edit panel
 * gives each field a stable id keyed by question id; look those up directly.
 */
function editPanelField(
  questionId: string,
  field: "reference-answer" | "explanation" | "title" | "content",
) {
  const el = document.getElementById(`${field}-${questionId}`);
  if (!el) {
    throw new Error(`Expected #${field}-${questionId} to be in the document`);
  }
  return el;
}

/**
 * Feature: A teacher corrects the model answer or explanation on a question
 * they already wrote (Step 20).
 */
describe("Feature: Question edit panel — model answer and explanation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("corrects a free_text question's model answer and explanation", async () => {
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

    await user.type(
      editPanelField(question.id, "reference-answer"),
      "Objects with mass attract each other.",
    );
    await user.type(
      editPanelField(question.id, "explanation"),
      "Newton's law of universal gravitation.",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated).toMatchObject({
      id: question.id,
      referenceAnswer: "Objects with mass attract each other.",
      explanation: "Newton's law of universal gravitation.",
    });
  });

  it("clears the model answer and explanation back to absent, not empty string", async () => {
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
      referenceAnswer: "Objects with mass attract each other.",
      explanation: "Newton's law of universal gravitation.",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    await user.clear(editPanelField(question.id, "reference-answer"));
    await user.clear(editPanelField(question.id, "explanation"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as FreeTextQuestion[];
    expect(updated.referenceAnswer).toBeUndefined();
    expect(updated.explanation).toBeUndefined();
  });

  it("shows and corrects a multiple-choice question's explanation", async () => {
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
      title: "What is 2 + 2?",
      content: "Choose the correct answer.",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
      ],
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    // No free-text-only controls on an MC question's own edit panel
    // (AddQuestionForm's own default-type Model Answer field is a separate,
    // unrelated field elsewhere on this page — see `editPanelField`'s note).
    // Checked by id, not an unscoped role query — the Add Question form's
    // own inherit radio shares this same "Use the test's setting" wording.
    expect(document.getElementById(`reference-answer-${question.id}`)).toBe(
      null,
    );
    expect(document.getElementById(`reveal-inherit-${question.id}`)).toBe(null);

    await user.type(
      editPanelField(question.id, "explanation"),
      "4 is the sum of 2 and 2.",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated).toMatchObject({
      id: question.id,
      explanation: "4 is the sum of 2 and 2.",
    });
  });
});

/**
 * Feature: A teacher editing an already-answered question is warned first,
 * in words naming their specific change, and nothing saves unless they
 * confirm (Step 25 / D29 / D50).
 */
describe("Feature: Question edit panel warns before saving an answered question", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("warns naming the specific change and does not save until the teacher confirms", async () => {
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
      referenceAnswer: "Objects with mass attract each other.",
    });

    // A student has already answered this question.
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

    await user.clear(editPanelField(question.id, "reference-answer"));
    await user.type(
      editPanelField(question.id, "reference-answer"),
      "A better model answer.",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // The confirmation names the specific change and that someone answered.
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/model answer/i);
    expect(dialog).toHaveTextContent(/1 student/i);

    // Nothing saved yet — the write is gated behind confirmation.
    const [beforeConfirm] = (await services.questionService.listQuestions(
      test.id,
    )) as FreeTextQuestion[];
    expect(beforeConfirm.referenceAnswer).toBe(
      "Objects with mass attract each other.",
    );

    await user.click(
      within(dialog).getByRole("button", { name: /save anyway/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [afterConfirm] = (await services.questionService.listQuestions(
      test.id,
    )) as FreeTextQuestion[];
    expect(afterConfirm.referenceAnswer).toBe("A better model answer.");
  });

  it("does not save the change when the teacher cancels the confirmation", async () => {
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
      referenceAnswer: "Objects with mass attract each other.",
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

    await user.clear(editPanelField(question.id, "reference-answer"));
    await user.type(
      editPanelField(question.id, "reference-answer"),
      "A better model answer.",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    const [afterCancel] = (await services.questionService.listQuestions(
      test.id,
    )) as FreeTextQuestion[];
    expect(afterCancel.referenceAnswer).toBe(
      "Objects with mass attract each other.",
    );
  });

  it("still shows the confirmation when Enter is pressed inside the Title field, not just on a Save click", async () => {
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

    await user.clear(editPanelField(question.id, "title"));
    // Enter is an implicit form submission (Title is the only text-ish
    // field) — it must hit the same gate as a Save click, not bypass it.
    await user.type(
      editPanelField(question.id, "title"),
      "Explain gravity (revised){Enter}",
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/title/i);

    const [beforeConfirm] = await services.questionService.listQuestions(
      test.id,
    );
    expect(beforeConfirm.title).toBe("Explain gravity");
  });

  it("does not warn when a student has answered but the teacher saves without changing anything", async () => {
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
      referenceAnswer: "Objects with mass attract each other.",
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

    // No fields touched — a real answered-student count alone must not gate.
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });
  });
});

/**
 * Feature: A teacher can fix a question's title and body after students
 * have answered it (Step 26).
 */
describe("Feature: Question edit panel — title and content", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the current title and body, and saves a correction to them", async () => {
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

    // Given: the panel shows the question's current wording
    expect(editPanelField(question.id, "title")).toHaveValue("Explain gravity");
    expect(editPanelField(question.id, "content")).toHaveValue(
      "In your own words.",
    );

    // When: the teacher corrects both and saves — nobody has answered yet,
    // so this submits immediately with no confirmation (Step 25).
    await user.clear(editPanelField(question.id, "title"));
    await user.type(
      editPanelField(question.id, "title"),
      "Explain gravity (revised)",
    );
    await user.clear(editPanelField(question.id, "content"));
    await user.type(
      editPanelField(question.id, "content"),
      "Write two sentences.",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated.title).toBe("Explain gravity (revised)");
    expect(updated.content).toBe("Write two sentences.");
  });
});

/**
 * Feature: A teacher can rewrite a question's answer options, told plainly
 * that answered students will show as having chosen nothing (Step 27).
 */
describe("Feature: Question edit panel — answer options", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the question's current options, prefilled and editable", async () => {
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
      title: "Pick the capital",
      content: "Choose one.",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "Paris", isCorrect: true },
        { text: "London", isCorrect: false },
      ],
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
    expect(screen.getByDisplayValue("London")).toBeInTheDocument();
  });

  it("saves a rewritten option list, preserving the kept option's id and minting one for the new option", async () => {
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
      title: "Pick the capital",
      content: "Choose one.",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "Paris", isCorrect: true },
        { text: "London", isCorrect: false },
      ],
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    // Hold the element handle rather than re-querying by (now ambiguous)
    // empty display value — several other inputs on the page start blank.
    const parisInput = screen.getByDisplayValue("Paris");
    await user.clear(parisInput);
    await user.type(parisInput, "Paris (capital of France)");
    await user.click(screen.getByRole("button", { name: /add option/i }));
    const newOptionInput = document.getElementById(
      `option-text-${question.id}-2`,
    );
    if (!newOptionInput) throw new Error("Expected a third option input");
    await user.type(newOptionInput, "Berlin");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as SingleSelectQuestion[];
    const originalIds = (question as SingleSelectQuestion).options.map(
      (o) => o.id,
    );
    const originalParisId = (question as SingleSelectQuestion).options.find(
      (o) => o.text === "Paris",
    )?.id;
    expect(updated.options.find((o) => o.id === originalParisId)?.text).toBe(
      "Paris (capital of France)",
    );
    const newOption = updated.options.find((o) => !originalIds.includes(o.id));
    expect(newOption?.text).toBe("Berlin");
  });

  it("warns that answered students will show as having chosen nothing when options change on an answered question", async () => {
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
    const question = (await services.questionService.addQuestion(test.id, {
      title: "Pick the capital",
      content: "Choose one.",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "Paris", isCorrect: true },
        { text: "London", isCorrect: false },
      ],
    })) as SingleSelectQuestion;
    const londonId = question.options.find((o) => o.text === "London")?.id;

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "mc", selectedIds: londonId ? [londonId] : [] },
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    const parisInput = screen.getByDisplayValue("Paris");
    await user.clear(parisInput);
    await user.type(parisInput, "Paris (renamed)");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/chosen nothing/i);
  });

  it("saves a title-only edit on an answered keyless MC question without re-validating its missing answer key (D69)", async () => {
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
    // A keyless MC question (D32/D44) — the "Needs an answer key" badge
    // exists precisely so a teacher can still open and save this question.
    const question = (await services.questionService.addQuestion(
      test.id,
      {
        title: "Pick one",
        content: "Choose.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: false },
          { text: "B", isCorrect: false },
        ],
      },
      { allowMissingAnswerKey: true },
    )) as SingleSelectQuestion;

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "mc", selectedIds: [question.options[0].id] },
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    await user.clear(editPanelField(question.id, "title"));
    await user.type(editPanelField(question.id, "title"), "Pick one (revised)");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: /save anyway/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as SingleSelectQuestion[];
    expect(updated.title).toBe("Pick one (revised)");
    expect(updated.options.map((o) => o.text)).toEqual(["A", "B"]);
    expect(updated.options.every((o) => !o.isCorrect)).toBe(true);
  });

  it("does not warn or change anything when an answered MC question is saved without touching its options", async () => {
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
    const question = (await services.questionService.addQuestion(test.id, {
      title: "Pick the capital",
      content: "Choose one.",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "Paris", isCorrect: true },
        { text: "London", isCorrect: false },
      ],
    })) as SingleSelectQuestion;

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "mc", selectedIds: [question.options[0].id] },
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    // No fields touched — a real answered-student count alone must not gate.
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });
  });
});

/**
 * Feature: A teacher can change what kind of question it is, told that
 * doing so invalidates every answer already given for it (Step 28).
 */
describe("Feature: Question edit panel — question type", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a type switcher with the question's current type selected", async () => {
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
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    expect(screen.getByRole("radio", { name: /^free text$/i })).toBeChecked();
  });

  it("switching to single_select reveals an options editor, and saving persists the new type and options", async () => {
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
    await services.questionService.addQuestion(test.id, {
      title: "Explain gravity",
      content: "In your own words.",
      createdBy: "admin",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    await user.click(screen.getByRole("radio", { name: /^single select$/i }));

    const options = screen.getAllByPlaceholderText(/^Option \d$/);
    expect(options).toHaveLength(2);
    await user.type(options[0], "Force");
    await user.click(
      screen.getByRole("radio", { name: /mark option 1 correct/i }),
    );
    await user.type(options[1], "Energy");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as SingleSelectQuestion[];
    expect(updated.type).toBe("single_select");
    expect(updated.options.map((o) => o.text)).toEqual(["Force", "Energy"]);
  });

  it("warns that changing the type invalidates every answer already given for it", async () => {
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

    await user.click(screen.getByRole("radio", { name: /^image answer$/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/invalidates every answer/i);
  });
});

describe("Feature: Question edit panel — multi-select grading strategy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("starts on the question's stored grading strategy and saves a changed choice", async () => {
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
    // Stored as partial, not the control's own All-or-nothing fallback, so
    // the panel must read the stored rule to start on it.
    const question = await services.questionService.addQuestion(test.id, {
      title: "Pick the prime numbers",
      content: "Choose all that apply.",
      type: "multi_select",
      options: [
        { text: "2", isCorrect: true },
        { text: "3", isCorrect: true },
        { text: "4", isCorrect: false },
      ],
      mcGradingStrategy: "partial",
      createdBy: "admin",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    const partialRadio = document.getElementById(
      `grading-partial-${question.id}`,
    );
    if (!partialRadio) throw new Error("Expected the partial radio to exist");
    expect(partialRadio).toBeChecked();

    const allOrNothingRadio = document.getElementById(
      `grading-all-or-nothing-${question.id}`,
    );
    if (!allOrNothingRadio) {
      throw new Error("Expected the all-or-nothing radio to exist");
    }
    await user.click(allOrNothingRadio);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as MultiSelectQuestion[];
    expect(updated.mcGradingStrategy).toBe("all_or_nothing");
  });

  it("warns and names the grading rule when it's the only change on an answered multi_select question", async () => {
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
      title: "Pick the prime numbers",
      content: "Choose all that apply.",
      type: "multi_select",
      options: [
        { text: "2", isCorrect: true },
        { text: "3", isCorrect: true },
        { text: "4", isCorrect: false },
      ],
      mcGradingStrategy: "all_or_nothing",
      createdBy: "admin",
    });

    // A student has already answered this question.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "mc", selectedIds: [question.options[0].id] },
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    const partialRadio = document.getElementById(
      `grading-partial-${question.id}`,
    );
    if (!partialRadio) throw new Error("Expected the partial radio to exist");
    await user.click(partialRadio);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/grading rule/i);
    expect(dialog).toHaveTextContent(/future submissions/i);
    expect(dialog).toHaveTextContent(/existing scores stay/i);

    // Nothing saved yet — the write is gated behind confirmation.
    const [beforeConfirm] = (await services.questionService.listQuestions(
      test.id,
    )) as MultiSelectQuestion[];
    expect(beforeConfirm.mcGradingStrategy).toBe("all_or_nothing");

    await user.click(
      within(dialog).getByRole("button", { name: /save anyway/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const [afterConfirm] = (await services.questionService.listQuestions(
      test.id,
    )) as MultiSelectQuestion[];
    expect(afterConfirm.mcGradingStrategy).toBe("partial");
  });

  it("hides the grading control for a single_select question", async () => {
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
      title: "Pick the prime number",
      content: "Choose one.",
      type: "single_select",
      options: [
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ],
      createdBy: "admin",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(page);

    expect(
      document.getElementById(`grading-all-or-nothing-${question.id}`),
    ).toBe(null);
  });
});
