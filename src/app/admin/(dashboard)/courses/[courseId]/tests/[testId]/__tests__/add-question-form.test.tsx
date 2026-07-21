// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { addQuestionAction } from "../actions";
import { AddQuestionForm } from "../add-question-form";
import { requestUploadSlotsAction } from "../question-media-actions";

vi.mock("../actions", () => ({
  addQuestionAction: vi.fn(),
}));

vi.mock("../question-media-actions", () => ({
  requestUploadSlotsAction: vi.fn(),
}));

/**
 * Feature: Add Question Form
 * As an admin
 * I want a form to add questions with markdown content
 * So that I can build tests with rich content
 */

describe("Feature: Add Question Form", () => {
  describe("Scenario: Admin sees the question form", () => {
    it("should display title field, content textarea, and submit button", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      expect(screen.getByLabelText("Question Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Content (Markdown)")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add Question" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin adds an image-answer question", () => {
    it("offers the image-answer type, hides the options builder, and submits type image_answer", async () => {
      // Given the add-question form
      const user = userEvent.setup();
      vi.mocked(addQuestionAction).mockResolvedValue({
        success: true,
        message: "Question added successfully",
      });
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // When the admin selects the Image Answer type
      await user.click(screen.getByRole("button", { name: "Image Answer" }));

      // Then no multiple-choice options builder is shown
      expect(
        screen.queryByRole("button", { name: "+ Add Option" }),
      ).not.toBeInTheDocument();

      // And submitting creates an image_answer question
      await user.type(
        screen.getByLabelText("Question Title"),
        "Solve the integral",
      );
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      await waitFor(() => expect(addQuestionAction).toHaveBeenCalled());
      const formData = vi.mocked(addQuestionAction).mock.calls[0][1];
      expect(formData.get("type")).toBe("image_answer");
      expect(formData.get("options")).toBeNull();
    });
  });

  describe("Scenario: Content textarea is configured for markdown", () => {
    it("should have sufficient rows for pasting markdown", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      const textarea = screen.getByLabelText("Content (Markdown)");
      const rows = Number.parseInt(textarea.getAttribute("rows") ?? "0", 10);
      expect(rows).toBeGreaterThanOrEqual(15);
    });
  });

  describe("Scenario: Admin sees selected media files listed", () => {
    it("should display each chosen file's name after selection", async () => {
      // Given
      const user = userEvent.setup();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const file = new File(["data"], "photo.png", { type: "image/png" });

      // When
      await user.upload(screen.getByLabelText(/media files/i), file);

      // Then
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin removes a selected media file", () => {
    it("should remove that file from the list while leaving others intact", async () => {
      // Given
      const user = userEvent.setup();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const fileA = new File(["a"], "photo-a.png", { type: "image/png" });
      const fileB = new File(["b"], "photo-b.png", { type: "image/png" });

      // When — select two files, then remove the first
      await user.upload(screen.getByLabelText(/media files/i), [fileA, fileB]);
      await user.click(
        screen.getByRole("button", { name: /remove photo-a\.png/i }),
      );

      // Then — fileA is gone, fileB remains
      expect(screen.queryByText("photo-a.png")).not.toBeInTheDocument();
      expect(screen.getByText("photo-b.png")).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin selects an unsupported file type", () => {
    it("should show an inline error and not list the file", async () => {
      // Given
      // applyAccept:false lets the test deliver a file the input's `accept`
      // would normally filter — mirrors drag-drop / programmatic selection,
      // which the client-side validation must still catch.
      const user = userEvent.setup({ applyAccept: false });
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const gif = new File(["data"], "anim.gif", { type: "image/gif" });

      // When
      await user.upload(screen.getByLabelText(/media files/i), gif);

      // Then
      expect(screen.getByText("Unsupported media type")).toBeInTheDocument();
      expect(screen.queryByText("anim.gif")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: Admin selects a file larger than the size limit", () => {
    it("should show an inline error and not list the oversized file", async () => {
      // Given — a PNG just over the 10 MB cap (size faked, no real buffer)
      const user = userEvent.setup();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const big = new File(["x"], "big.png", { type: "image/png" });
      Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });

      // When
      await user.upload(screen.getByLabelText(/media files/i), big);

      // Then
      expect(
        screen.getByText("Each media file must be 10 MB or smaller"),
      ).toBeInTheDocument();
      expect(screen.queryByText("big.png")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: Admin selects more than the allowed number of files", () => {
    it("should block the extra file with an inline error once 3 are selected", async () => {
      // Given — three valid files already selected
      const user = userEvent.setup();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const png = (n: number) =>
        new File(["x"], `p${n}.png`, { type: "image/png" });
      // Exact label avoids matching the list's "Selected media files" aria-label.
      const input = screen.getByLabelText("Media Files");
      await user.upload(input, [png(1), png(2), png(3)]);

      // When — attempt a fourth
      await user.upload(input, png(4));

      // Then — fourth blocked, error shown, the first three remain
      expect(
        screen.getByText("A question can have at most 3 media files"),
      ).toBeInTheDocument();
      expect(screen.queryByText("p4.png")).not.toBeInTheDocument();
      expect(screen.getByText("p1.png")).toBeInTheDocument();
    });
  });

  describe("Scenario: Picker resets after a question with media is created", () => {
    it("should clear the selected media list after a successful submit", async () => {
      // Given — a selected file and a successful upload + create
      const user = userEvent.setup();
      vi.mocked(requestUploadSlotsAction).mockResolvedValue({
        success: true,
        message: "OK",
        slots: [
          {
            key: "media/questions/x.png",
            url: "https://fake-s3.local/put/media/questions/x.png",
            contentType: "image/png",
            order: 0,
          },
        ],
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      );
      vi.mocked(addQuestionAction).mockResolvedValue({
        success: true,
        message: "Question added",
      });
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);
      const file = new File(["data"], "photo.png", { type: "image/png" });
      await user.upload(screen.getByLabelText("Media Files"), file);
      await user.type(screen.getByLabelText("Question Title"), "Q1");
      expect(screen.getByText("photo.png")).toBeInTheDocument();

      // When
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      // Then — the selected media list is cleared for the next entry
      await waitFor(() =>
        expect(screen.queryByText("photo.png")).not.toBeInTheDocument(),
      );

      vi.unstubAllGlobals();
    });
  });

  describe("Scenario: Admin submits without filling the title", () => {
    it("should not invoke the add action when the title is empty", async () => {
      // Setup
      const user = userEvent.setup();
      vi.mocked(addQuestionAction).mockClear();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Action — click submit without typing a title
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      // Assert — HTML5 form validation blocks submission, so the server
      // action is never invoked. This is the user-observable outcome:
      // nothing happens (no success banner, no error banner).
      expect(addQuestionAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
