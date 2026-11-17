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
import { formatPictureLink } from "src/lib/picture-links";
import { MediaContentType } from "src/lib/question-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
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
 * Seeds a pool holding one Question Bank question with pictures A and B.
 * @param content - The question's stored content.
 * @param options - Its choices; a single-select question when given.
 * @returns The pool and the question.
 */
async function seedPoolQuestion(
  content: string,
  options?: { text: string; isCorrect: boolean }[],
) {
  const services = getTestServices();
  const pool = await services.questionPoolService.createPool({
    name: "Pool",
    description: "",
    createdBy: "admin-1",
  });
  const fields = {
    title: "Read the chart",
    content,
    createdBy: "admin-1",
    media: [picture(KEY_A, 0), picture(KEY_B, 1)],
  };
  const question = options
    ? await services.poolQuestionService.addPoolQuestion(pool.id, {
        ...fields,
        type: "single_select",
        options,
      })
    : await services.poolQuestionService.addPoolQuestion(pool.id, fields);
  return { pool, question };
}

/**
 * Feature: Picture links in Question Bank questions
 * As a teacher
 * I want text that names a picture to follow that picture
 * So that removing or reordering pictures never leaves the wrong "Picture k"
 */
describe("Feature: Picture links in the Question Bank", () => {
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

  it("stores a typed [image 2] as a link, and shows it as Picture 1 once picture 1 is removed, leaving the stored link alone", async () => {
    // Given: a Question Bank question with pictures A and B
    const user = userEvent.setup();
    const { pool, question } = await seedPoolQuestion("Plain");
    const params = Promise.resolve({ poolId: pool.id });
    const { rerender } = render(await PoolDetailPage({ params }));

    // When: the teacher types [image 2] in the content and saves
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    let dialog = await screen.findByRole("dialog", { name: /edit question/i });
    fireEvent.change(within(dialog).getByLabelText(/^content/i), {
      target: { value: "Compare with [image 2]" },
    });
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the stored text links picture B
    const link = `Compare with ${formatPictureLink(KEY_B)}`;
    const stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(stored?.content).toBe(link);

    // When: the page refreshes, the modal opens again and picture 1 is removed
    rerender(await PoolDetailPage({ params }));
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    dialog = await screen.findByRole("dialog", { name: /edit question/i });
    expect(within(dialog).getByLabelText(/^content/i)).toHaveValue(
      "Compare with [image 2]",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the link is untouched and the preview names it Picture 1
    const after = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(after?.content).toBe(link);
    rerender(await PoolDetailPage({ params }));
    expect(
      screen.getAllByText(/Compare with Picture 1/).length,
    ).toBeGreaterThan(0);
  });
  it("saves an untouched linked question unchanged and records no change", async () => {
    // Given: a Question Bank question whose content and options link pictures
    const user = userEvent.setup();
    const content = `See ${formatPictureLink(KEY_B)}`;
    const { pool, question } = await seedPoolQuestion(content, [
      { text: formatPictureLink(KEY_A), isCorrect: true },
      { text: formatPictureLink(KEY_B), isCorrect: false },
    ]);
    render(
      await PoolDetailPage({ params: Promise.resolve({ poolId: pool.id }) }),
    );

    // When: the teacher opens Edit and saves without changing anything
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /edit question/i,
    });
    expect(within(dialog).getByLabelText(/^content/i)).toHaveValue(
      "See [image 2]",
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the stored text is byte-identical and the change log has no row
    const stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
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
    // Given: older content that literally contains [image 1], with pictures
    const user = userEvent.setup();
    const { pool, question } = await seedPoolQuestion("see [image 1]");
    const params = Promise.resolve({ poolId: pool.id });
    const { rerender } = render(await PoolDetailPage({ params }));

    // When: the teacher saves without changing anything
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    let dialog = await screen.findByRole("dialog", { name: /edit question/i });
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the content is byte-identical and nothing is logged
    let stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(stored?.content).toBe("see [image 1]");
    expect(
      await db
        .collection("questionChangeLog")
        .countDocuments({ questionId: question.id }),
    ).toBe(0);

    // When: the teacher edits only the title
    rerender(await PoolDetailPage({ params }));
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    dialog = await screen.findByRole("dialog", { name: /edit question/i });
    fireEvent.change(within(dialog).getByLabelText(/^title/i), {
      target: { value: "New title" },
    });
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the title changed and the content is still byte-identical
    stored = await db.collection("pool_question").findOne({ id: question.id });
    expect(stored?.title).toBe("New title");
    expect(stored?.content).toBe("see [image 1]");
  });

  it("warns when the text names a picture the teacher removed, and still lets them save", async () => {
    // Given: content linking picture B, shown in the modal as [image 2]
    const user = userEvent.setup();
    const { pool } = await seedPoolQuestion(
      `Look at ${formatPictureLink(KEY_B)}`,
    );
    render(
      await PoolDetailPage({ params: Promise.resolve({ poolId: pool.id }) }),
    );
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /edit question/i,
    });
    expect(
      within(dialog).queryByText(/names a picture/i),
    ).not.toBeInTheDocument();

    // When: the teacher removes picture 2
    await user.click(
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
