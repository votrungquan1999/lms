// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { MediaContentType } from "src/lib/question-service";
import type { Test } from "src/lib/test-service";
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
  await setupTestDb();
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
    const ui = await GradingDetailQuestion({
      test,
      courseId: "course-1",
      questionId: created.id,
      students: [],
      basePath: "/admin/grading/test-1",
    });
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
