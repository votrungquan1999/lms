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
import { MediaContentType } from "src/lib/question-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getFakeS3,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PoolDetailPage from "../page";

let db: Db;

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: vi.fn(async () => ({
      userId: "admin-1",
      school: TEST_SCHOOL,
    })),
  })),
}));

const KEY_A = `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`;
const KEY_B = `media/schools/${TEST_SCHOOL_ID}/questions/bbbbbbbb-0000.png`;
const KEY_C = `media/schools/${TEST_SCHOOL_ID}/questions/cccccccc-0000.png`;

/**
 * A stored picture entry for a seeded question.
 * @param key - The picture's storage key.
 * @param order - Its position.
 */
function picture(key: string, order: number) {
  return {
    key,
    contentType: MediaContentType.PNG,
    order,
    size: 100,
    fileName: `${order}.png`,
  };
}

/**
 * Seeds a pool with one question holding pictures A and B and opens its Edit modal.
 * @returns The pool, the question and the open dialog.
 */
async function seedAndOpenEdit() {
  const pool = await getTestServices().questionPoolService.createPool({
    name: "Pool",
    description: "",
    createdBy: "admin-1",
  });
  const question = await getTestServices().poolQuestionService.addPoolQuestion(
    pool.id,
    {
      title: "Read the chart",
      content: "Describe it.",
      createdBy: "admin-1",
      media: [picture(KEY_A, 0), picture(KEY_B, 1)],
    },
  );
  render(
    await PoolDetailPage({ params: Promise.resolve({ poolId: pool.id }) }),
  );
  await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  const dialog = await screen.findByRole("dialog", { name: /edit question/i });
  return { pool, question, dialog };
}

/**
 * Adds picture C to the stored question behind an open modal's back, as
 * another teacher's save would.
 * @param questionId - The question to add to.
 */
async function addPictureCElsewhere(questionId: string) {
  await db
    .collection("pool_question")
    .updateOne(
      { id: questionId },
      { $push: { media: picture(KEY_C, 2) } as never },
    );
}

/**
 * Feature: Two teachers editing one Question Bank question's pictures
 * As a teacher
 * I want a picture another teacher added while my Edit modal was open to survive my save
 * So that nobody's picture work is silently lost
 */
describe("Feature: Concurrent picture edits in the Question Bank", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.unstubAllGlobals();
  });

  it("keeps a picture another teacher added while the modal was open, and deletes only the one removed", async () => {
    // Given: pictures A and B, with the modal open
    const user = userEvent.setup();
    const { question, dialog } = await seedAndOpenEdit();

    // When: another teacher adds C, then this teacher removes A and saves
    await addPictureCElsewhere(question.id);
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: B and C remain in order, A left storage and C stayed
    const stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(
      stored?.media.map((m: { key: string; order: number }) => [
        m.key,
        m.order,
      ]),
    ).toEqual([
      [KEY_B, 0],
      [KEY_C, 1],
    ]);
    expect(getFakeS3().deletedKeys).toEqual([KEY_A]);
  });

  it("refuses a save whose merged pictures would pass three, and keeps what is stored", async () => {
    // Given: pictures A and B, with the modal open and one new file picked
    const user = userEvent.setup();
    const { question, dialog } = await seedAndOpenEdit();
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["d"], "d.png", { type: "image/png" }),
    );

    // When: another teacher adds C, then this teacher saves the new file
    await addPictureCElsewhere(question.id);
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the save is refused with the limit message and A, B, C stay
    expect(
      await within(dialog).findByText(
        "A question can have at most 3 media files",
      ),
    ).toBeInTheDocument();
    const stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(stored?.media.map((m: { key: string }) => m.key)).toEqual([
      KEY_A,
      KEY_B,
      KEY_C,
    ]);
    expect(getFakeS3().deletedKeys).toEqual([]);
  });

  it("reuses a file the failed first attempt already uploaded instead of uploading it again", async () => {
    // Given: a new file picked in the open modal
    const user = userEvent.setup();
    const { question, dialog } = await seedAndOpenEdit();
    const fetchMock = vi.mocked(fetch);
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
    const stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(stored?.title).toBe("Fixed title");
    expect(stored?.media.map((m: { key: string }) => m.key)).toEqual([
      KEY_A,
      KEY_B,
      uploadedKey,
    ]);
  });
});
