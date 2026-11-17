// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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

describe("Feature: Pool detail page — question preview formatting", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("renders a pool question's content through the markdown renderer, not as raw source", async () => {
    const services = getTestServices();
    const pool = await services.questionPoolService.createPool({
      name: "Pool",
      description: "",
      createdBy: "admin-1",
    });
    await services.poolQuestionService.addPoolQuestion(pool.id, {
      title: "Q1",
      content: "This is **bold** text.",
      createdBy: "admin-1",
    });

    const ui = await PoolDetailPage({
      params: Promise.resolve({ poolId: pool.id }),
    });
    render(ui);

    // Bold renders as an element, not literal asterisks — scoped to the
    // rendered preview, since the edit panel below it legitimately keeps
    // the raw markdown source in its own (unrelated) textarea.
    const strongEl = screen.getByText("bold", { selector: "strong" });
    const preview = strongEl.closest(".prose");
    if (!preview) throw new Error("Expected a rendered markdown preview");
    expect(within(preview as HTMLElement).queryByText(/\*\*bold\*\*/)).toBe(
      null,
    );
  });

  it("shows a multi-select question as a student would see it, with its key, settings and picture", async () => {
    // Given: a multi-select pool question with a picture and an explanation
    const services = getTestServices();
    const pool = await services.questionPoolService.createPool({
      name: "Pool",
      description: "",
      createdBy: "admin-1",
    });
    const key = `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`;
    await services.poolQuestionService.addPoolQuestion(pool.id, {
      title: "Pick the primes",
      content:
        "Which of these numbers are prime, as the long text goes on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on?",
      createdBy: "admin-1",
      type: "multi_select",
      options: [
        { text: "2", isCorrect: true },
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ],
      mcGradingStrategy: "partial",
      explanation: "Primes have exactly two divisors.",
      media: [
        {
          key,
          contentType: MediaContentType.PNG,
          order: 0,
          size: 100,
          fileName: "a.png",
        },
      ],
    });

    // When: the teacher opens the pool page
    render(
      await PoolDetailPage({ params: Promise.resolve({ poolId: pool.id }) }),
    );

    // Then: the card reads like the student's, with the teacher-only key beneath
    const heading = screen.getByText("Question 1: Pick the primes");
    const card = heading.closest('[data-slot="card"]');
    if (!(card instanceof HTMLElement)) throw new Error("Expected a card");
    // The still-inline edit form also holds the text, so read the rendered markdown
    expect(card.querySelector(".prose")).toHaveTextContent(/and on\?/);
    expect(card).not.toHaveTextContent("…");
    const header = heading.closest('[data-slot="card-header"]');
    if (!(header instanceof HTMLElement)) throw new Error("Expected a header");
    expect(within(header).getByText("Multi Select")).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: /delete question/i }),
    ).toBeInTheDocument();
    expect(within(card).getByText("2 (correct)")).toBeInTheDocument();
    expect(within(card).getByText("4")).toBeInTheDocument();
    expect(within(card).getByText("7 (correct)")).toBeInTheDocument();
    expect(
      within(card)
        .getByText(/^Grading:$/)
        .closest("p"),
    ).toHaveTextContent("Partial credit");
    expect(
      within(card)
        .getByText(/^Explanation:$/)
        .closest("p"),
    ).toHaveTextContent("Primes have exactly two divisors.");
    const picture = within(card).getByRole("img", { name: "Picture 1" });
    expect(picture).toHaveAttribute("src", `https://fake-s3.local/get/${key}`);
  });

  it("shows a free-text question's model answer and answer-reveal setting, with no answered count", async () => {
    // Given: a free-text pool question with a model answer and a reveal override
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
      referenceAnswer: "Masses attract each other.",
      answerRevealMode: "diff",
    });

    // When: the teacher opens the pool page
    render(
      await PoolDetailPage({ params: Promise.resolve({ poolId: pool.id }) }),
    );

    // Then: the key shows the model answer and the reveal setting, nothing test-only
    const card = screen
      .getByText("Question 1: Explain gravity")
      .closest('[data-slot="card"]');
    if (!(card instanceof HTMLElement)) throw new Error("Expected a card");
    expect(
      within(card)
        .getByText(/^Model answer:$/)
        .closest("p"),
    ).toHaveTextContent("Masses attract each other.");
    expect(
      within(card)
        .getByText(/^How students see their answer:$/)
        .closest("p"),
    ).toHaveTextContent("Side-by-side comparison");
    expect(card).not.toHaveTextContent(/have answered this/);
    expect(card).not.toHaveTextContent(/Needs an answer key/);
  });
});
