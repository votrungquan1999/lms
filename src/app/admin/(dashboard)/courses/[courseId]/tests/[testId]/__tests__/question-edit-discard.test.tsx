// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

/**
 * Seeds a test with one free-text question and renders its page.
 * @param withPicture - Whether the question holds one stored picture.
 * @returns The test's id and the question's id.
 */
async function renderPageWithQuestion(withPicture = false): Promise<{
  testId: string;
  questionId: string;
}> {
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
  const params = Promise.resolve({ courseId: course.id, testId: test.id });
  render(await TestDetailPage({ params }));
  return { testId: test.id, questionId: question.id };
}

/** Opens the Edit modal of the page's only question and returns the dialog. */
async function openEditModal(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
  return screen.findByRole("dialog", { name: /edit question/i });
}

describe("Feature: closing the test question Edit modal with unsaved changes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({
      userId: "admin-1",
      school: TEST_SCHOOL,
    });
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.unstubAllGlobals();
  });

  it('asks "Discard your changes?" on Escape, keeps the typing on Keep editing, and closes on Discard without saving', async () => {
    // Given: the Edit modal with a retitled, unsaved question
    const user = userEvent.setup();
    const { testId } = await renderPageWithQuestion();
    const dialog = await openEditModal();
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Explain universal gravitation");

    // When: the teacher presses Escape
    await user.keyboard("{Escape}");

    // Then: the modal asks first and stays open
    expect(
      await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { hidden: true })).toBeVisible();

    // When: the teacher keeps editing
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    // Then: the typing is still there
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Explain universal gravitation",
    );

    // When: the teacher closes again and discards
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    // Then: the modal is gone and nothing was saved
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const [stored] =
      await getTestServices().questionService.listQuestions(testId);
    expect(stored.title).toBe("Explain gravity");
  });

  it.each([
    [
      "the X button",
      () => userEvent.click(screen.getByRole("button", { name: "Close" })),
    ],
    [
      "Cancel",
      () => userEvent.click(screen.getByRole("button", { name: "Cancel" })),
    ],
    [
      "a click outside the modal",
      // The body is pointer-events: none under a modal, so the overlay gets the press directly.
      async () => {
        const overlay = document.querySelector('[data-slot="dialog-overlay"]');
        if (!overlay) throw new Error("no overlay");
        fireEvent.pointerDown(overlay);
      },
    ],
  ])(
    "asks before closing on %s when the title was changed",
    async (_name, close) => {
      await renderPageWithQuestion();
      const dialog = await openEditModal();
      await userEvent.type(within(dialog).getByLabelText("Title"), " more");

      await close();

      expect(
        await screen.findByRole("alertdialog", {
          name: "Discard your changes?",
        }),
      ).toBeInTheDocument();
    },
  );

  it("closes straight away when nothing changed, and when a change was typed back to the original", async () => {
    const user = userEvent.setup();
    await renderPageWithQuestion();

    const dialog = await openEditModal();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    const reopened = await openEditModal();
    const title = within(reopened).getByLabelText("Title");
    await user.type(title, "!");
    await user.type(title, "{Backspace}");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  it("counts a removed picture as an unsaved change", async () => {
    await renderPageWithQuestion(true);
    const dialog = await openEditModal();
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
    const dialog = await openEditModal();
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["c"], "c.png", { type: "image/png" }),
    );

    // When: the teacher saves and then tries to leave
    await user.click(within(dialog).getByRole("button", { name: /^save/i }));
    await waitFor(() => expect(finishUpload).toBeDefined());
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Title")).toBeDisabled(),
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();

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

  it("frees the close lock when a save fails, so Cancel asks again", async () => {
    // Given: the storage refuses the new file
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    const user = userEvent.setup();
    await renderPageWithQuestion();
    const dialog = await openEditModal();
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["c"], "c.png", { type: "image/png" }),
    );

    // When: the save fails and the teacher cancels
    await user.click(within(dialog).getByRole("button", { name: /^save/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Upload failed for c.png",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // Then: the modal is still open and asks before dropping the file
    expect(
      await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeInTheDocument();
  });
});
