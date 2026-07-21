// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

describe("Feature: grader sees a student's image answer", () => {
  it("renders the student's submitted photos via presigned URLs", async () => {
    // Given an image-answer question the student answered with two photos
    const { questionService, answerService } = getTestServices();
    const question = await questionService.addQuestion("test-1", {
      title: "Solve the integral",
      content: "Upload your work",
      createdBy: "admin-1",
      type: "image_answer",
    });
    await answerService.submitAnswer({
      testId: "test-1",
      questionId: question.id,
      studentId: "student-1",
      answer: {
        type: "image",
        mediaKeys: ["answers/student-1/p1.png", "answers/student-1/p2.png"],
      },
    });

    // When the grader opens that question's grading pane
    const ui = await GradingDetailQuestion({
      test,
      courseId: "course-1",
      questionId: question.id,
      students: [{ id: "student-1", name: "Stu", username: "stu" }],
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then the two submitted photos render via presigned URLs
    const photos = screen.getAllByRole("img");
    const srcs = photos.map((el) => el.getAttribute("src"));
    expect(srcs).toContain(
      "https://fake-s3.local/get/answers/student-1/p1.png",
    );
    expect(srcs).toContain(
      "https://fake-s3.local/get/answers/student-1/p2.png",
    );
  });
});
