// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * Seeds a Question Bank with one free-text question and renders its page.
 * @param withPicture - Whether the question holds one stored picture.
 * @returns The pool's id.
 */
async function renderPageWithQuestion(withPicture = false): Promise<string> {
  const services = getTestServices();
  const pool = await services.questionPoolService.createPool({
    name: "Pool",
    description: "",
    createdBy: "admin-1",
  });
  await services.poolQuestionService.addPoolQuestion(pool.id, {
    title: "Explain gravity",
    content: "In your own words.",
    createdBy: "admin-1",
    media: withPicture
      ? [
          {
            key: `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`,
            contentType: MediaContentType.PNG,
            order: 0,
            size: 111,
            fileName: "a.png",
          },
        ]
      : undefined,
  });
  render(
    await PoolDetailPage({ params: Promise.resolve({ poolId: pool.id }) }),
  );
  return pool.id;
}

describe("Feature: closing the Question Bank Edit modal with unsaved changes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.unstubAllGlobals();
  });

  it('asks "Discard your changes?" on Escape, closes on Discard without saving, and closes straight away when nothing changed', async () => {
    // Given: the Edit modal with a retitled, unsaved question
    const user = userEvent.setup();
    const poolId = await renderPageWithQuestion();
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Explain universal gravitation");

    // When: the teacher presses Escape and discards
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    // Then: the modal is gone and nothing was saved
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const [stored] =
      await getTestServices().poolQuestionService.listPoolQuestions(poolId);
    expect(stored.title).toBe("Explain gravity");

    // When: the reopened modal is left untouched and closed
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    // Then: it closes without asking
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("counts a removed picture as an unsaved change", async () => {
    await renderPageWithQuestion(true);
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );

    await userEvent.keyboard("{Escape}");

    expect(
      await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeInTheDocument();
  });

  it("locks the fields and ignores every close request while a save with a new file runs, then closes when it finishes", async () => {
    // Given: the new file's upload is held open
    let finishUpload: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishUpload = () => resolve(new Response(null, { status: 200 }));
          }),
      ),
    );
    const user = userEvent.setup();
    await renderPageWithQuestion();
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["c"], "c.png", { type: "image/png" }),
    );

    // When: the teacher saves and then tries to leave
    await user.click(within(dialog).getByRole("button", { name: /^save/i }));
    await waitFor(() => expect(finishUpload).toBeDefined());
    expect(within(dialog).getByLabelText("Title")).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Then: the modal stays, with no discard question
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    // When: the upload and save finish
    finishUpload?.();

    // Then: the modal closes
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
