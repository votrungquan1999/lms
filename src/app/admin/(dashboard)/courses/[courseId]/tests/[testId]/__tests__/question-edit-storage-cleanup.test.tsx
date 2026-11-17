// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Db } from "mongodb";
import {
  MediaContentType,
  type QuestionMediaInput,
} from "src/lib/question-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getFakeS3,
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
 * Builds a save that removes every picture from a question.
 * @param questionId - The question being saved.
 * @param testId - Its test.
 * @param courseId - The test's course.
 */
function removeAllMediaForm(
  questionId: string,
  testId: string,
  courseId: string,
): FormData {
  const form = new FormData();
  form.set("questionId", questionId);
  form.set("testId", testId);
  form.set("courseId", courseId);
  form.set("media", JSON.stringify({ removedKeys: [KEY_A], added: [] }));
  return form;
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
 * Feature: Removed pictures leave storage
 * As a teacher
 * I want pictures I remove to stop taking up storage
 * So that unused files do not pile up, while shared files stay safe
 */
let db: Db;

describe("Feature: Storage cleanup after removing a picture", () => {
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

  it("deletes a removed picture's file when no other question holds it", async () => {
    // Given: a question with one picture only it holds
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
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [picture(KEY_A, 0)],
    });

    // When: the teacher removes the picture and saves
    const dialog = await renderAndOpenEdit(course.id, test.id);
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: its file is deleted from storage
    expect(getFakeS3().deletedKeys).toEqual([KEY_A]);
  });
  it("keeps a removed picture's file when a Question Bank question still holds it", async () => {
    // Given: a test question whose picture is shared with a pool question
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
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [picture(KEY_A, 0)],
    });
    await db.collection("pool_question").insertOne({
      id: "pool-question-1",
      media: [picture(KEY_A, 0)],
      deletedAt: null,
    });

    // When: the teacher removes the picture from the test question
    const dialog = await renderAndOpenEdit(course.id, test.id);
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the test question lost it but storage keeps the shared file
    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated.media).toEqual([]);
    expect(getFakeS3().deletedKeys).toEqual([]);
  });
  it("keeps a removed picture's file when a question in another test still holds it", async () => {
    // Given: two tests whose questions share one picture
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
    const otherTest = await services.testService.createTest(course.id, {
      title: "Other test",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [picture(KEY_A, 0)],
    });
    await services.questionService.addQuestion(otherTest.id, {
      title: "Read the same chart",
      content: "Describe it again.",
      createdBy: "admin",
      media: [picture(KEY_A, 0)],
    });

    // When: the first question drops the picture
    const result = await updateQuestionAction(
      null,
      removeAllMediaForm(question.id, test.id, course.id),
    );

    // Then: the save succeeds and storage keeps the shared file
    expect(result.success).toBe(true);
    expect(getFakeS3().deletedKeys).toEqual([]);
  });
  it("deletes a removed picture's file when only a deleted question still lists it", async () => {
    // Given: a live question and a deleted one that both list the picture
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
      media: [picture(KEY_A, 0)],
    });
    const deleted = await services.questionService.addQuestion(test.id, {
      title: "Old copy",
      content: "Describe it.",
      createdBy: "admin",
      media: [picture(KEY_A, 0)],
    });
    await services.questionService.deleteQuestion(test.id, deleted.id, "admin");

    // When: the live question drops the picture
    const result = await updateQuestionAction(
      null,
      removeAllMediaForm(question.id, test.id, course.id),
    );

    // Then: the deleted question does not keep the file alive
    expect(result.success).toBe(true);
    expect(getFakeS3().deletedKeys).toEqual([KEY_A]);
  });
  it("deletes nothing and keeps the question when the save is refused", async () => {
    // Given: a question with one picture
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
      media: [picture(KEY_A, 0)],
    });

    // When: a save names a picture the question never held
    const form = new FormData();
    form.set("questionId", question.id);
    form.set("testId", test.id);
    form.set("courseId", course.id);
    form.set(
      "media",
      JSON.stringify({
        removedKeys: [],
        added: [{ ...picture(KEY_A, 1), key: KEY_A }],
      }),
    );
    const result = await updateQuestionAction(null, form);

    // Then: the save is refused, the picture stays and nothing is deleted
    expect(result).toMatchObject({
      success: false,
      message: "Invalid media key",
    });
    const [stored] = await services.questionService.listQuestions(test.id);
    expect(stored.media.map((m) => m.key)).toEqual([KEY_A]);
    expect(getFakeS3().deletedKeys).toEqual([]);
  });
  it("still saves the change when deleting the file from storage fails", async () => {
    // Given: a question with one picture and a storage that refuses deletes
    const user = userEvent.setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
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
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin",
      media: [picture(KEY_A, 0)],
    });
    getFakeS3().deleteFailure = new Error("storage unavailable");

    // When: the teacher removes the picture and saves
    const dialog = await renderAndOpenEdit(course.id, test.id);
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the modal closes, the picture is gone from the question and the failure is logged
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [updated] = await services.questionService.listQuestions(test.id);
    expect(updated.media).toEqual([]);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("storage unavailable"),
    );
    logged.mockRestore();
  });
});
