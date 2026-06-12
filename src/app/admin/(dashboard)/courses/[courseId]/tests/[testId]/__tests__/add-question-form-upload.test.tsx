// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddQuestionForm } from "../add-question-form";

/**
 * Integration: the add-question form's submit path runs the REAL server
 * actions (requestUploadSlotsAction + addQuestionAction) against a real test DB
 * and the deterministic fake S3. Only the browser→S3 PUT (global.fetch) is
 * mocked — our own server code is exercised end to end.
 */

// Real DB-backed services + deterministic fake S3.
vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
// Irrelevant to the upload behavior under test.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// headers() is awaited then handed to requireAdminSession (separately stubbed).
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
});

afterEach(async () => {
  await teardownTestDb();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Feature: Add Question Form — media upload on submit", () => {
  describe("Scenario: Admin submits a question with media", () => {
    it("PUTs each selected file to its presigned slot with a matching content-type", async () => {
      // Given — a question with two media files selected
      const user = userEvent.setup();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const png = new File(["a"], "photo.png", { type: "image/png" });
      const mp4 = new File(["b"], "clip.mp4", { type: "video/mp4" });
      await user.upload(screen.getByLabelText("Media Files"), [png, mp4]);
      await user.type(screen.getByLabelText("Question Title"), "Q with media");

      // When
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      // Then — one PUT per file, to a presigned slot URL, with matching type
      const fetchMock = vi.mocked(fetch);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const calls = fetchMock.mock.calls;
      const urls = calls.map(([url]) => String(url));
      const types = calls.map(
        ([, init]) => (init as RequestInit).headers as Record<string, string>,
      );
      expect(
        urls.every((u) => u.startsWith("https://fake-s3.local/put/")),
      ).toBe(true);
      expect(
        calls.every(([, init]) => (init as RequestInit).method === "PUT"),
      ).toBe(true);
      expect(types.map((h) => h["Content-Type"]).sort()).toEqual([
        "image/png",
        "video/mp4",
      ]);
    });

    it("persists the created question with its media in the listed order", async () => {
      // Given — two files selected in a known order
      const user = userEvent.setup();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const png = new File(["a"], "first.png", { type: "image/png" });
      const mp4 = new File(["b"], "second.mp4", { type: "video/mp4" });
      await user.upload(screen.getByLabelText("Media Files"), [png, mp4]);
      await user.type(screen.getByLabelText("Question Title"), "Ordered media");

      // When
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      // Then — the persisted question carries both media entries, in order
      await waitFor(async () => {
        const [question] =
          await getTestServices().questionService.listQuestions("test-1");
        expect(question?.media).toHaveLength(2);
      });
      const [question] =
        await getTestServices().questionService.listQuestions("test-1");
      expect(question.media.map((m) => m.contentType)).toEqual([
        "image/png",
        "video/mp4",
      ]);
      expect(question.media.map((m) => m.order)).toEqual([0, 1]);
      expect(
        question.media.every((m) => m.key.startsWith("media/questions/")),
      ).toBe(true);
    });
  });

  describe("Scenario: A media upload fails during submit", () => {
    it("surfaces an error, keeps the files, and does not create the question", async () => {
      // Given — the browser→S3 PUT will fail
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      );
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const png = new File(["a"], "photo.png", { type: "image/png" });
      await user.upload(screen.getByLabelText("Media Files"), png);
      await user.type(screen.getByLabelText("Question Title"), "Will fail");

      // When
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      // Then — an error is shown to the admin
      await waitFor(() =>
        expect(screen.getByText("Network error")).toBeInTheDocument(),
      );
      // ...the selected file remains for retry...
      expect(screen.getByText("photo.png")).toBeInTheDocument();
      // ...and no question was created.
      const questions =
        await getTestServices().questionService.listQuestions("test-1");
      expect(questions).toHaveLength(0);
    });
  });
});
