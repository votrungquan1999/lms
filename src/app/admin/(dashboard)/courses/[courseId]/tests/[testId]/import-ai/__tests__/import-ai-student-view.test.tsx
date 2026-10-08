// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));

import { requestUploadSlotsAction } from "../../question-media-actions";
import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

beforeEach(() => {
  // jsdom has no object URLs; name each preview after its file.
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

/**
 * Renders the import page and uploads a document whose AI drafts are a
 * free-text question with a table and a picture, a multiple-choice question
 * with an explanation, and a free-text question with a model answer.
 */
async function uploadDocument(): Promise<void> {
  const user = userEvent.setup();
  vi.mocked(extractDocx).mockResolvedValue({
    text: "[image 1]Câu 14 ...",
    pictures: [
      {
        number: 1,
        file: new File(["png"], "picture-1.png", { type: "image/png" }),
      },
    ],
  });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: "Extracted 3 question(s)",
    questions: [
      {
        title: "Câu 14",
        content:
          "Quan sát bảng.\n\n| Bộ phận | Chức năng |\n|---|---|\n| Nhân | Điều khiển |",
        type: "free_text",
        imageNumbers: [1],
      },
      {
        title: "Capital",
        content: "Capital of France?",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "Rome", isCorrect: false },
        ],
        explanation: "Paris has been the capital since 987.",
      },
      {
        title: "Explain",
        content: "Why is the sky blue?",
        type: "free_text",
        referenceAnswer: "Rayleigh scattering.",
        explanation: "Shorter wavelengths scatter more.",
      },
    ],
  });

  render(
    <ImportAiProvider>
      <ImportAiFilePicker />
      <QuestionPreviewList
        testId="test-1"
        courseId="course-1"
        existingQuestionCount={0}
        answeredStudentCount={0}
      />
    </ImportAiProvider>,
  );

  await user.upload(
    screen.getByLabelText(/document/i),
    new File(["docx"], "exam.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  await screen.findByText("Câu 14");
}

describe("Feature: teacher previews AI-drafted questions in Student view", () => {
  it("shows each draft as a student sees it, with no answer key, and saves nothing", async () => {
    const user = userEvent.setup();
    await uploadDocument();

    await user.click(screen.getByRole("button", { name: "Student view" }));
    const student = within(
      screen.getByRole("region", { name: "Student view" }),
    );

    // Numbered titles, formatted content, picture under the content
    expect(student.getByText("Question 1: Câu 14")).toBeInTheDocument();
    expect(student.getByRole("table")).toBeInTheDocument();
    expect(student.getByRole("img")).toHaveAttribute(
      "src",
      "blob:picture-1.png",
    );
    expect(student.getByText("Question 2: Capital")).toBeInTheDocument();
    expect(student.getByText("Question 3: Explain")).toBeInTheDocument();

    // Answer controls with plain option text, clickable
    const rome = student.getByRole("radio", { name: "Rome" });
    expect(student.getByRole("radio", { name: "Paris" })).not.toBeChecked();
    await user.click(rome);
    expect(rome).toBeChecked();
    expect(
      student.getAllByPlaceholderText("Type your answer here..."),
    ).toHaveLength(2);

    // No answer key, model answer, explanation, or submit
    expect(student.queryByText("✓")).toBeNull();
    expect(student.queryByText(/Rayleigh/)).toBeNull();
    expect(student.queryByText(/scatter/)).toBeNull();
    expect(student.queryByText(/since 987/)).toBeNull();
    expect(
      student.queryByRole("button", { name: /submit answer/i }),
    ).toBeNull();

    // Nothing saved or uploaded
    expect(importAiQuestionsAction).not.toHaveBeenCalled();
    expect(requestUploadSlotsAction).not.toHaveBeenCalled();
  });

  it("keeps the teacher's open edit and saved edits while Student view shows, and student picks never touch the draft", async () => {
    const user = userEvent.setup();
    await uploadDocument();

    // Given an open edit on Capital with typed text, and a saved edit on Câu 14
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[1]);
    const capitalTitle = screen.getByLabelText(/title/i);
    await user.clear(capitalTitle);
    await user.type(capitalTitle, "Capital city");
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    const [firstTitle] = screen.getAllByLabelText(/title/i);
    await user.clear(firstTitle);
    await user.type(firstTitle, "Câu 14 edited");
    await user.click(screen.getAllByRole("button", { name: /^save$/i })[0]);

    // When the teacher flips to Student view, picks Rome, and flips back
    await user.click(screen.getByRole("button", { name: "Student view" }));
    await user.click(
      within(screen.getByRole("region", { name: "Student view" })).getByRole(
        "radio",
        { name: "Rome" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Teacher view" }));

    // Then the open edit still holds its typed text and the saved edit shows
    expect(screen.getByLabelText(/title/i)).toHaveValue("Capital city");
    expect(screen.getByText("Câu 14 edited")).toBeVisible();
  });

  it("leaves the draft's answer mark on Paris after a student pick of Rome", async () => {
    const user = userEvent.setup();
    await uploadDocument();

    await user.click(screen.getByRole("button", { name: "Student view" }));
    await user.click(
      within(screen.getByRole("region", { name: "Student view" })).getByRole(
        "radio",
        { name: "Rome" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Teacher view" }));

    const paris = screen.getByText("Paris").closest("li, div") as HTMLElement;
    expect(within(paris).getByText("✓")).toBeVisible();
  });

  it("drops the colon from the rejection label when the draft has no title", async () => {
    const user = userEvent.setup();
    await uploadDocument();
    // Clear Capital's title through its edit form
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[1]);
    await user.clear(screen.getByLabelText(/title/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [
        {
          key: "media/questions/k1.png",
          url: "https://fake-s3.local/put/k1",
          contentType: "image/png",
          order: 0,
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: 'Question 2 (""): Exactly one option must be marked correct.',
      invalidQuestionIndex: 1,
      invalidQuestionReason: "Exactly one option must be marked correct.",
    });

    await user.click(screen.getByRole("button", { name: "Student view" }));
    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Question 2 — Exactly one option must be marked correct.",
    );
  });

  it("drops the colon from the rejection label when the draft title is only whitespace", async () => {
    const user = userEvent.setup();
    await uploadDocument();
    // Give Capital a blank-looking title through its edit form
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[1]);
    await user.clear(screen.getByLabelText(/title/i));
    await user.type(screen.getByLabelText(/title/i), "   ");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [
        {
          key: "media/questions/k1.png",
          url: "https://fake-s3.local/put/k1",
          contentType: "image/png",
          order: 0,
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: 'Question 2 (""): Exactly one option must be marked correct.',
      invalidQuestionIndex: 1,
      invalidQuestionReason: "Exactly one option must be marked correct.",
    });

    await user.click(screen.getByRole("button", { name: "Student view" }));
    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Question 2 — Exactly one option must be marked correct.",
    );
  });

  it("returns to Teacher view when another file is chosen, so fresh drafts show their answer marks", async () => {
    const user = userEvent.setup();
    await uploadDocument();
    await user.click(screen.getByRole("button", { name: "Student view" }));

    // When the teacher picks a different document
    vi.mocked(extractDocx).mockResolvedValue({
      text: "Câu 1 ...",
      pictures: [],
    });
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        {
          title: "Fresh draft",
          content: "Is it fresh?",
          type: "single_select",
          options: [
            { text: "Yes", isCorrect: true },
            { text: "No", isCorrect: false },
          ],
        },
      ],
    });
    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await screen.findByText("Fresh draft");

    // Then the review list is back on the teacher's view with its answer marks
    expect(
      screen.getByRole("button", { name: "Teacher view" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: "Student view" })).toBeNull();
    expect(screen.getByText("Fresh draft")).toBeVisible();
    expect(screen.getByText("✓")).toBeVisible();
  });

  it("keeps Student view and shows the rejection reason under the Import button, led by the card's own label", async () => {
    const user = userEvent.setup();
    // Student view cards are numbered from 1, so Capital (review position 2) is Question 2
    await uploadDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [
        {
          key: "media/questions/k1.png",
          url: "https://fake-s3.local/put/k1",
          contentType: "image/png",
          order: 0,
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message:
        'Question 2 ("Capital"): Exactly one option must be marked correct.',
      invalidQuestionIndex: 1,
      invalidQuestionReason: "Exactly one option must be marked correct.",
    });

    await user.click(screen.getByRole("button", { name: "Student view" }));
    await user.click(screen.getByRole("button", { name: "Import questions" }));

    // The reason leads with the Student view label, not the server's review-position text
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Question 2: Capital — Exactly one option must be marked correct.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent('("Capital")');
    expect(
      screen.getByRole("button", { name: "Student view" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the server's own text on the question's card in Teacher view", async () => {
    const user = userEvent.setup();
    await uploadDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [
        {
          key: "media/questions/k1.png",
          url: "https://fake-s3.local/put/k1",
          contentType: "image/png",
          order: 0,
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message:
        'Question 2 ("Capital"): Exactly one option must be marked correct.',
      invalidQuestionIndex: 1,
      invalidQuestionReason: "Exactly one option must be marked correct.",
    });

    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Question 2 ("Capital"): Exactly one option must be marked correct.',
    );
  });

  it("also names the card when a picture upload fails under the Import button in Student view", async () => {
    const user = userEvent.setup();
    await uploadDocument();
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: false,
      message: "Each media file must be 10 MB or smaller",
    });

    await user.click(screen.getByRole("button", { name: "Student view" }));
    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Question 1: Câu 14 — Its pictures could not be uploaded: Each media file must be 10 MB or smaller",
    );
    expect(importAiQuestionsAction).not.toHaveBeenCalled();
  });
});
