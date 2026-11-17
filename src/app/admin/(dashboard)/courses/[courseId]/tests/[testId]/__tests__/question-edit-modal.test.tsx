// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Db } from "mongodb";
import {
  MediaContentType,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

const mockRequireAdminSession = vi.fn();
let db: Db;

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

/** Opens the Edit modal of the page's only editable question and returns the dialog. */
async function openEditModal(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  return screen.findByRole("dialog", { name: /edit question/i });
}

/**
 * Feature: A teacher edits a test question in an Edit modal
 * As a teacher
 * I want to change a question in a modal and see it updated in the preview
 * So that I edit without a long inline form on the page
 */
describe("Feature: Test question Edit modal", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    ({ db } = await setupTestDb());
    mockRequireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.unstubAllGlobals();
  });

  it("opens an Edit question modal, saves a new title, closes, and the preview shows it", async () => {
    // Given: a test page with one free-text question
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
    const params = Promise.resolve({ courseId: course.id, testId: test.id });
    const { rerender } = render(await TestDetailPage({ params }));

    // When: the teacher opens Edit, retitles the question and saves
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /edit question/i,
    });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Explain universal gravitation");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the modal closes and the new title is stored
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated).toMatchObject({
      id: question.id,
      title: "Explain universal gravitation",
    });

    // And: once the page refreshes (revalidate is mocked) the preview shows it
    rerender(await TestDetailPage({ params }));
    expect(
      screen.getByText("Question 1: Explain universal gravitation"),
    ).toBeInTheDocument();
  });

  it("edits a picture-answer question's title, text and type", async () => {
    // Given: a picture-answer question
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
      title: "Solve the integral",
      content: "Upload a photo of your handwritten solution.",
      createdBy: "admin",
      type: "image_answer",
    });
    const params = Promise.resolve({ courseId: course.id, testId: test.id });
    const { rerender } = render(await TestDetailPage({ params }));

    // When: the teacher opens Edit, rewrites it and turns it into a Single Select
    const dialog = await openEditModal();
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Which result is right?");
    const content = within(dialog).getByLabelText("Content (Markdown)");
    await user.clear(content);
    await user.type(content, "Pick one.");
    await user.click(
      within(dialog).getByRole("radio", { name: /^single select$/i }),
    );
    const options = within(dialog).getAllByPlaceholderText(/^Option \d$/);
    await user.type(options[0], "x + C");
    await user.click(
      within(dialog).getByRole("radio", { name: /mark option 1 correct/i }),
    );
    await user.type(options[1], "x");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the modal closes and the type, text and options are stored
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [updated] = (await services.questionService.listQuestions(
      test.id,
    )) as SingleSelectQuestion[];
    expect(updated).toMatchObject({
      id: question.id,
      type: "single_select",
      title: "Which result is right?",
      content: "Pick one.",
    });
    expect(updated.options.map((o) => o.text)).toEqual(["x + C", "x"]);
    expect(updated.options.map((o) => o.isCorrect)).toEqual([true, false]);

    // And: the preview shows the new type in the card header
    rerender(await TestDetailPage({ params }));
    const header = screen
      .getByText("Question 1: Which result is right?")
      .closest('[data-slot="card-header"]');
    if (!(header instanceof HTMLElement)) throw new Error("Expected a header");
    expect(within(header).getByText("Single Select")).toBeInTheDocument();
  });
  it("removes one picture, adds another and retitles in a single save", async () => {
    // Given: a question with two pictures
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
    const keyA = `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`;
    const keyB = `media/schools/${TEST_SCHOOL_ID}/questions/bbbbbbbb-0000.png`;
    const question = await services.questionService.addQuestion(test.id, {
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [
        {
          key: keyA,
          contentType: MediaContentType.PNG,
          order: 0,
          size: 111,
          fileName: "a.png",
        },
        {
          key: keyB,
          contentType: MediaContentType.PNG,
          order: 1,
          size: 222,
          fileName: "b.png",
        },
      ],
    });
    const params = Promise.resolve({ courseId: course.id, testId: test.id });
    const { rerender } = render(await TestDetailPage({ params }));

    // When: the teacher drops the first picture, picks a new file and retitles
    const dialog = await openEditModal();
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["c"], "c.png", { type: "image/png" }),
    );
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Read the new chart");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the kept picture keeps its stored details, the new one follows it
    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated.title).toBe("Read the new chart");
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.media).toEqual([
      {
        key: keyB,
        contentType: "image/png",
        order: 0,
        size: 222,
        fileName: "b.png",
      },
      expect.objectContaining({
        contentType: "image/png",
        order: 1,
        size: 1,
        fileName: "c.png",
      }),
    ]);

    // And: the text and picture change landed as one update
    const logRows = await db
      .collection("questionChangeLog")
      .find({ questionId: question.id })
      .toArray();
    expect(logRows).toHaveLength(1);

    // And: the refreshed preview shows both pictures
    rerender(await TestDetailPage({ params }));
    const card = screen
      .getByText("Question 1: Read the new chart")
      .closest('[data-slot="card"]');
    if (!(card instanceof HTMLElement)) throw new Error("Expected a card");
    expect(
      within(card)
        .getAllByRole("img")
        .map((i) => i.getAttribute("alt")),
    ).toEqual(["Picture 1", "Picture 2"]);
  });
  it("asks for confirmation naming the pictures when only a picture changes on an answered question", async () => {
    // Given: an answered question with one picture
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
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [
        {
          key: `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`,
          contentType: MediaContentType.PNG,
          order: 0,
          size: 111,
          fileName: "a.png",
        },
      ],
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "free_text", text: "My attempt" },
    });
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // When: the teacher removes the picture and saves
    const dialog = await openEditModal();
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the confirmation names the pictures and nothing is saved yet
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/pictures/i);
    const [stillStored] = await services.questionService.listQuestions(test.id);
    expect(stillStored.media).toHaveLength(1);
  });
  it("replaces an existing video with a new one", async () => {
    // Given: a question with one MP4 video
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
    const oldKey = `media/schools/${TEST_SCHOOL_ID}/questions/cccccccc-0000.mp4`;
    const question = await services.questionService.addQuestion(test.id, {
      title: "Watch the demo",
      content: "What happens?",
      createdBy: "admin",
      media: [
        {
          key: oldKey,
          contentType: MediaContentType.MP4,
          order: 0,
          size: 500,
          fileName: "old.mp4",
        },
      ],
    });
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // When: the teacher removes the video, picks a new MP4 and saves
    const dialog = await openEditModal();
    await user.click(
      within(dialog).getByRole("button", { name: /remove video/i }),
    );
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["v"], "new.mp4", { type: "video/mp4" }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: only the new video is stored
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.media).toEqual([
      expect.objectContaining({
        contentType: "video/mp4",
        fileName: "new.mp4",
        order: 0,
      }),
    ]);
    expect(stored?.media[0].key).not.toBe(oldKey);
  });

  it("accepts only as many new files as free slots after kept pictures and shows the cap message", async () => {
    // Given: a question that already holds two pictures
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
    const picture = (letter: string, order: number) => ({
      key: `media/schools/${TEST_SCHOOL_ID}/questions/${letter.repeat(8)}-0000.png`,
      contentType: MediaContentType.PNG,
      order,
      size: 100,
      fileName: `${letter}.png`,
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [picture("a", 0), picture("b", 1)],
    });
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // When: the teacher keeps both pictures and picks two more files
    const dialog = await openEditModal();
    await user.upload(within(dialog).getByLabelText("Media Files"), [
      new File(["c"], "c.png", { type: "image/png" }),
      new File(["d"], "d.png", { type: "image/png" }),
    ]);

    // Then: the cap message shows
    expect(
      await within(dialog).findByText(
        "A question can have at most 3 media files",
      ),
    ).toBeInTheDocument();

    // And: only one of the two files is saved
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.media).toHaveLength(3);
  });
});
