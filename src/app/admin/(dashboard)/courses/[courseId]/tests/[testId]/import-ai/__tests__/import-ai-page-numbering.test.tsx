// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  importAiQuestionsAction: vi.fn(),
  retryQuestionAction: vi.fn(),
}));
vi.mock("../../question-media-actions", () => ({
  requestUploadSlotsAction: vi.fn(),
}));

import { parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import ImportAiPage from "../page";

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.resetAllMocks();
});

describe("Feature: Student view numbers drafts as the page's real test would save them", () => {
  it("continues after the highest live question number, not the question count, when one was deleted", async () => {
    const user = userEvent.setup();
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
    // Given questions #1-#3 with #2 deleted: count 2, highest number 3
    const added = [];
    for (const title of ["Q1", "Q2", "Q3"]) {
      added.push(
        await services.questionService.addQuestion(test.id, {
          type: "free_text",
          title,
          content: title,
          createdBy: "admin",
        }),
      );
    }
    await services.questionService.deleteQuestion(added[1].id, "admin");

    vi.mocked(extractDocx).mockResolvedValue({ text: "Câu 1", pictures: [] });
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [{ title: "Fresh", content: "New?", type: "free_text" }],
    });
    render(
      await ImportAiPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    // When a document is uploaded and Student view is chosen
    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "exam.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await screen.findByText("Fresh");
    await user.click(screen.getByRole("button", { name: "Student view" }));

    // Then the draft is numbered 4, as it will be saved
    expect(
      within(screen.getByRole("region", { name: "Student view" })).getByText(
        "Question 4: Fresh",
      ),
    ).toBeInTheDocument();
  });
});
