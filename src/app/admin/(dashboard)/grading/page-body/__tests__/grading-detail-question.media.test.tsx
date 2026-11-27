// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MediaContentType } from "src/lib/question-service";
import type { Test } from "src/lib/test-service";
import { insertRawTest } from "src/tests/insert-raw-test";
import { questionDetailProps } from "src/tests/question-detail-props";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailQuestion } from "../grading-detail-question";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

const test = { id: "test-1" } as Test;

beforeEach(async () => {
  const { db } = await setupTestDb();
  await insertRawTest(db, test.id);
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: media renders in the admin grading view", () => {
  it("renders the focused question's image and video, in order, with presigned src", async () => {
    // Given a question with ordered media
    const created = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Graded with media",
        content: "Look at the attachments.",
        createdBy: "admin-1",
        media: [
          {
            key: "media/a.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1000,
            fileName: "a.png",
          },
          {
            key: "media/b.mp4",
            contentType: MediaContentType.MP4,
            order: 1,
            size: 2000,
            fileName: "b.mp4",
          },
        ],
      },
    );

    // When the grader opens that question's grading pane
    const ui = await GradingDetailQuestion(
      await questionDetailProps({
        test,
        courseId: "course-1",
        questionId: created.id,
        student: { id: "student-1", name: "Stu", username: "stu" },
      }),
    );
    const { container } = render(ui);

    // Then the image and video render in the teacher's order, via presigned URLs
    const elements = Array.from(container.querySelectorAll("img, video"));
    expect(elements.map((el) => el.tagName.toLowerCase())).toEqual([
      "img",
      "video",
    ]);
    expect(elements.map((el) => el.getAttribute("src"))).toEqual([
      "https://fake-s3.local/get/media/a.png",
      "https://fake-s3.local/get/media/b.mp4",
    ]);
  });
});

describe("Feature: picture links read as Picture k in the admin grading view", () => {
  it("shows a linked title by the picture's current number, never the stored link", async () => {
    // Given a question whose text links the second of two pictures
    const picture = (key: string, order: number) => ({
      key,
      contentType: MediaContentType.PNG,
      order,
      size: 1000,
      fileName: `${order}.png`,
    });
    const created = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Compare {{picture:media/b.png}}",
        content: "",
        createdBy: "admin-1",
        media: [picture("media/a.png", 0), picture("media/b.png", 1)],
      },
    );

    // When the grader opens that question's grading pane
    render(
      await GradingDetailQuestion(
        await questionDetailProps({
          test,
          courseId: "course-1",
          questionId: created.id,
          student: { id: "student-1", name: "Stu", username: "stu" },
        }),
      ),
    );

    // Then the grader reads the label the student saw
    expect(screen.getAllByText(/Compare Picture 2/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\{\{picture:/)).not.toBeInTheDocument();
  });
});
