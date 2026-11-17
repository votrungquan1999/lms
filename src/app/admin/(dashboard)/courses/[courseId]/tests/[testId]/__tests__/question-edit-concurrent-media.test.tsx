// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const KEY_C = `media/schools/${TEST_SCHOOL_ID}/questions/cccccccc-0000.png`;

let db: Db;

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
 * Seeds a test with one question holding pictures A and B.
 * @returns The course, test and question.
 */
async function seedQuestion() {
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
    media: [picture(KEY_A, 0), picture(KEY_B, 1)],
  });
  return { course, test, question };
}

/**
 * Adds a picture to the stored question behind an open modal's back, as
 * another teacher's save would.
 * @param questionId - The question to add to.
 * @param entry - The picture to append.
 */
async function addPictureElsewhere(
  questionId: string,
  entry: QuestionMediaInput,
) {
  await db
    .collection("question")
    .updateOne({ id: questionId }, { $push: { media: entry } as never });
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
 * Feature: Two teachers editing one question's pictures
 * As a teacher
 * I want a picture another teacher added while my Edit modal was open to survive my save
 * So that nobody's picture work is silently lost
 */
describe("Feature: Concurrent picture edits on the test page", () => {
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

  it("keeps a picture another teacher added while the modal was open, and deletes only the one removed", async () => {
    // Given: pictures A and B, with the modal open
    const user = userEvent.setup();
    const { course, test, question } = await seedQuestion();
    const dialog = await renderAndOpenEdit(course.id, test.id);

    // When: another teacher adds C, then this teacher removes A and saves
    await addPictureElsewhere(question.id, picture(KEY_C, 2));
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: B and C remain in order, A left storage and C stayed
    const [saved] = await getTestServices().questionService.listQuestions(
      test.id,
    );
    expect(saved.media.map((m) => [m.key, m.order])).toEqual([
      [KEY_B, 0],
      [KEY_C, 1],
    ]);
    expect(getFakeS3().deletedKeys).toEqual([KEY_A]);
  });

  it("refuses a save whose merged pictures would pass three, and keeps what is stored", async () => {
    // Given: pictures A and B, with the modal open and one new file picked
    const user = userEvent.setup();
    const { course, test, question } = await seedQuestion();
    const dialog = await renderAndOpenEdit(course.id, test.id);
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["d"], "d.png", { type: "image/png" }),
    );

    // When: another teacher adds C, then this teacher saves the new file
    await addPictureElsewhere(question.id, picture(KEY_C, 2));
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the save is refused with the limit message and A, B, C stay
    expect(
      await within(dialog).findByText(
        "A question can have at most 3 media files",
      ),
    ).toBeInTheDocument();
    const [stored] = await getTestServices().questionService.listQuestions(
      test.id,
    );
    expect(stored.media.map((m) => m.key)).toEqual([KEY_A, KEY_B, KEY_C]);
    expect(getFakeS3().deletedKeys).toEqual([]);
  });

  it("reuses a file the failed first attempt already uploaded instead of uploading it again", async () => {
    // Given: a new file picked in the open modal
    const user = userEvent.setup();
    const { course, test, question } = await seedQuestion();
    const fetchMock = vi.mocked(fetch);
    const dialog = await renderAndOpenEdit(course.id, test.id);
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["d"], "d.png", { type: "image/png" }),
    );

    // When: the first save is refused for a blank title, then the title is fixed and saved again
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "" },
    });
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await within(dialog).findByRole("alert");
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Fixed title" },
    });
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the file was uploaded once and the question holds that first upload
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const uploadedKey = String(fetchMock.mock.calls[0][0]).replace(
      "https://fake-s3.local/put/",
      "",
    );
    const [saved] = await getTestServices().questionService.listQuestions(
      test.id,
    );
    expect(saved.id).toBe(question.id);
    expect(saved.title).toBe("Fixed title");
    expect(saved.media.map((m) => m.key)).toEqual([KEY_A, KEY_B, uploadedKey]);
  });
});
