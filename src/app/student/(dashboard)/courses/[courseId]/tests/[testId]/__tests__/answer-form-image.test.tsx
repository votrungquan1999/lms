// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitAnswerAction } from "../actions";
import { AnswerForm } from "../answer-form";
import { requestAnswerImageUploadSlotsAction } from "../answer-image-actions";

vi.mock("../actions", () => ({ submitAnswerAction: vi.fn() }));
vi.mock("../answer-image-actions", () => ({
  requestAnswerImageUploadSlotsAction: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(submitAnswerAction).mockResolvedValue({
    success: true,
    message: "Answer submitted successfully",
  });
  vi.mocked(requestAnswerImageUploadSlotsAction).mockResolvedValue({
    success: true,
    message: "Upload slots created",
    slots: [
      {
        key: "answers/student-7/photo.png",
        url: "https://fake-s3.local/put/answers/student-7/photo.png",
        contentType: "image/png",
        fileName: "work.png",
        size: 1000,
        order: 0,
      },
    ],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Feature: student answers an image-answer question", () => {
  it("uploads the chosen photo and submits its key as the answer", async () => {
    // Given an image-answer question with no prior submission
    const user = userEvent.setup();
    render(
      <AnswerForm
        testId="test-1"
        courseId="course-1"
        questionId="q-1"
        questionType="image_answer"
        existingImageCount={0}
      />,
    );

    // When the student picks a photo of their work and submits
    const photo = new File(["x"], "work.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Your photos"), photo);
    expect(screen.getByText("work.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit Answer" }));

    // Then the photo is PUT to its presigned slot and the key is submitted
    await waitFor(() => expect(submitAnswerAction).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "https://fake-s3.local/put/answers/student-7/photo.png",
      expect.objectContaining({ method: "PUT" }),
    );
    const formData = vi.mocked(submitAnswerAction).mock.calls[0][1];
    expect(JSON.parse(formData.get("mediaKeys") as string)).toEqual([
      "answers/student-7/photo.png",
    ]);
  });
});
