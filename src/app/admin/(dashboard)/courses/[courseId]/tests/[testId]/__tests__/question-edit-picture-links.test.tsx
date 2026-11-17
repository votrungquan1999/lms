// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Db } from "mongodb";
import { formatPictureLink } from "src/lib/picture-links";
import {
  MediaContentType,
  type QuestionMediaInput,
} from "src/lib/question-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateQuestionAction } from "../actions";
import TestDetailPage from "../page";

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

const KEY_A = `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`;
const KEY_B = `media/schools/${TEST_SCHOOL_ID}/questions/bbbbbbbb-0000.png`;

/**
 * A stored picture entry for a seeded question.
 * @param key - The picture's storage key.
 * @param order - Its position.
 */
function picture(key: string, order: number): QuestionMediaInput {
  return {
    key,
    contentType: MediaContentType.PNG,
    order,
    size: 100,
    fileName: `${order}.png`,
  };
}

/**
 * Seeds a course and test holding one free-text question with the given texts and pictures.
 * @param content - The question's stored content.
 * @param media - Its pictures.
 */
async function seedQuestion(content: string, media: QuestionMediaInput[]) {
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
    content,
    createdBy: "admin",
    media,
  });
  return { course, test, question };
}

/**
 * Renders the test page and opens the Edit modal of its only question.
 * @param courseId - The course the test belongs to.
 * @param testId - The test to render.
 * @returns The open Edit dialog.
 */
async function renderAndOpenEdit(
  courseId: string,
  testId: string,
): Promise<HTMLElement> {
  render(
    await TestDetailPage({ params: Promise.resolve({ courseId, testId }) }),
  );
  await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  return screen.findByRole("dialog", { name: /edit question/i });
}

/**
 * Replaces the content field's text and saves, waiting for the modal to close.
 * @param dialog - The open Edit dialog.
 * @param content - The text to type.
 */
async function saveContent(dialog: HTMLElement, content: string) {
  fireEvent.change(within(dialog).getByLabelText(/^content/i), {
    target: { value: content },
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: /^save$/i }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

let db: Db;

/**
 * Feature: Picture references in a saved question stay correct
 * As a teacher
 * I want text that names a picture to follow that picture
 * So that removing or reordering pictures never leaves the wrong "Picture k"
 */
describe("Feature: Picture links on the test page", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ db } = await setupTestDb());
    mockRequireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("stores a typed [image 2] as a link to that picture, not the number", async () => {
    // Given: a question with pictures A and B
    const { course, test, question } = await seedQuestion("Plain", [
      picture(KEY_A, 0),
      picture(KEY_B, 1),
    ]);

    // When: the teacher types [image 2] in the content and saves
    const dialog = await renderAndOpenEdit(course.id, test.id);
    await saveContent(dialog, "Compare with [image 2]");

    // Then: the stored text links picture B, not the number
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.content).toBe(`Compare with {{picture:${KEY_B}}}`);
  });

  it("shows a saved link as Picture 1 after the picture before it is removed, leaving the stored link alone", async () => {
    // Given: content linking picture B, with pictures A and B
    const { course, test, question } = await seedQuestion(
      `Compare with ${formatPictureLink(KEY_B)}`,
      [picture(KEY_A, 0), picture(KEY_B, 1)],
    );
    const dialog = await renderAndOpenEdit(course.id, test.id);
    expect(
      screen.getAllByText(/Compare with Picture 2/).length,
    ).toBeGreaterThan(0);

    // When: the teacher removes picture 1 and saves
    await userEvent.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^save$/i }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    cleanup();
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // Then: the link now reads Picture 1 and the stored text is unchanged
    expect(
      screen.getAllByText(/Compare with Picture 1/).length,
    ).toBeGreaterThan(0);
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.content).toBe(`Compare with ${formatPictureLink(KEY_B)}`);
  });

  it("shows (picture removed) where a link names a picture the question no longer holds", async () => {
    // Given: content linking picture B while only picture A is attached
    const { course, test } = await seedQuestion(
      `Look at ${formatPictureLink(KEY_B)}`,
      [picture(KEY_A, 0)],
    );

    // When: the test page renders
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // Then: students and teachers read a visible gap, not the raw link
    expect(
      screen.getAllByText(/Look at \(picture removed\)/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/\{\{picture:/)).not.toBeInTheDocument();
  });

  it("shows saved links as Picture k in the Student view tab", async () => {
    // Given: content linking picture B, with pictures A and B
    const { course, test } = await seedQuestion(
      `Compare with ${formatPictureLink(KEY_B)}`,
      [picture(KEY_A, 0), picture(KEY_B, 1)],
    );
    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // When: the teacher flips to Student view
    await userEvent.click(screen.getByRole("button", { name: "Student view" }));

    // Then: the student card reads the label, never the stored link
    const studentView = within(
      screen.getByRole("region", { name: "Student view" }),
    );
    expect(studentView.getByText("Compare with Picture 2")).toBeInTheDocument();
    expect(studentView.queryByText(/\{\{picture:/)).not.toBeInTheDocument();
  });

  it("saves an untouched linked question unchanged and records no change", async () => {
    // Given: a question whose content and option link pictures
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
    const content = `See ${formatPictureLink(KEY_B)}`;
    const question = await services.questionService.addQuestion(test.id, {
      title: "Pick one",
      content,
      type: "single_select",
      options: [
        { text: formatPictureLink(KEY_A), isCorrect: true },
        { text: formatPictureLink(KEY_B), isCorrect: false },
      ],
      createdBy: "admin",
      media: [picture(KEY_A, 0), picture(KEY_B, 1)],
    });

    // When: the teacher opens Edit and saves without changing anything
    const dialog = await renderAndOpenEdit(course.id, test.id);
    expect(within(dialog).getByLabelText(/^content/i)).toHaveValue(
      "See [image 2]",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^save$/i }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the stored text is byte-identical and the change log has no row
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.content).toBe(content);
    expect(stored?.options.map((o: { text: string }) => o.text)).toEqual([
      formatPictureLink(KEY_A),
      formatPictureLink(KEY_B),
    ]);
    expect(
      await db
        .collection("questionChangeLog")
        .countDocuments({ questionId: question.id }),
    ).toBe(0);
  });

  it("saves a field the teacher did not change exactly as stored, even when it literally says [image 1]", async () => {
    // Given: older content that literally contains [image 1], with one picture
    const { course, test, question } = await seedQuestion("see [image 1]", [
      picture(KEY_A, 0),
    ]);

    // When: the teacher saves without changing anything
    let dialog = await renderAndOpenEdit(course.id, test.id);
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^save$/i }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the content is byte-identical and nothing is logged
    let stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.content).toBe("see [image 1]");
    expect(
      await db
        .collection("questionChangeLog")
        .countDocuments({ questionId: question.id }),
    ).toBe(0);

    // When: the teacher edits only the title
    cleanup();
    dialog = await renderAndOpenEdit(course.id, test.id);
    fireEvent.change(within(dialog).getByLabelText(/^title/i), {
      target: { value: "New title" },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^save$/i }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the title changed and the content is still byte-identical
    stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.title).toBe("New title");
    expect(stored?.content).toBe("see [image 1]");
  });

  it("refuses a save whose text links a picture the question does not hold, or one of its videos", async () => {
    // Given: a question holding picture A and a video
    const videoKey = `media/schools/${TEST_SCHOOL_ID}/questions/vvvvvvvv-0000.mp4`;
    const { course, test, question } = await seedQuestion("Plain", [
      picture(KEY_A, 0),
      { ...picture(videoKey, 1), contentType: MediaContentType.MP4 },
    ]);

    // When: saves link a key the question never held, and the video
    const saveContent = (content: string) => {
      const form = new FormData();
      form.set("questionId", question.id);
      form.set("testId", test.id);
      form.set("courseId", course.id);
      form.set("content", content);
      return updateQuestionAction(null, form);
    };
    const foreign = await saveContent(`Look at ${formatPictureLink(KEY_B)}`);
    const video = await saveContent(`Look at ${formatPictureLink(videoKey)}`);

    // Then: both are refused and the stored text stays
    expect(foreign).toMatchObject({
      success: false,
      message: "Invalid media key",
    });
    expect(video).toMatchObject({
      success: false,
      message: "Invalid media key",
    });
    const stored = await db.collection("question").findOne({ id: question.id });
    expect(stored?.content).toBe("Plain");
  });

  it("keeps each picture's number while the modal is open, so a typed [image 2] keeps its meaning", async () => {
    // Given: pictures A and B in an open Edit modal
    const { course, test } = await seedQuestion("Plain", [
      picture(KEY_A, 0),
      picture(KEY_B, 1),
    ]);
    const dialog = await renderAndOpenEdit(course.id, test.id);

    // When: the teacher removes picture 1
    await userEvent.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );

    // Then: the other picture is still picture 2 and says what to type
    expect(
      within(dialog).getByRole("button", { name: /remove picture 2/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/\[image 2\]/)).toBeInTheDocument();
  });

  it("warns when the text names a picture the teacher removed, and still lets them save", async () => {
    // Given: content linking picture B, shown in the modal as [image 2]
    const { course, test } = await seedQuestion(
      `Look at ${formatPictureLink(KEY_B)}`,
      [picture(KEY_A, 0), picture(KEY_B, 1)],
    );
    const dialog = await renderAndOpenEdit(course.id, test.id);
    expect(
      within(dialog).queryByText(/names a picture/i),
    ).not.toBeInTheDocument();

    // When: the teacher removes picture 2
    await userEvent.click(
      within(dialog).getByRole("button", { name: /remove picture 2/i }),
    );

    // Then: the content is flagged and Save stays available
    expect(
      within(dialog).getByText(/the content names a picture you removed/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /^save$/i }),
    ).toBeEnabled();
  });
});
