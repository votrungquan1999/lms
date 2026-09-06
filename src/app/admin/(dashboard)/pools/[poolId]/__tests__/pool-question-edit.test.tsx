// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  PoolFreeTextQuestion,
  PoolSingleSelectQuestion,
} from "src/lib/pool-question-service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deletePoolQuestionAction,
  updatePoolQuestionAction,
} from "../../pool-question-actions";
import {
  DeletePoolQuestionButton,
  PoolQuestionEditPanel,
} from "../pool-question-edit.state";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../../pool-question-actions", () => ({
  updatePoolQuestionAction: vi.fn(),
  deletePoolQuestionAction: vi.fn(),
}));

/** Builds a minimal free_text pool question for the edit-panel tests. */
function freeTextQuestion(
  overrides: Partial<PoolFreeTextQuestion> = {},
): PoolFreeTextQuestion {
  return {
    id: "pq-1",
    poolId: "pool-1",
    title: "Explain gravity",
    content: "In your own words.",
    order: 1,
    createdAt: new Date(0),
    weight: 1,
    media: [],
    type: "free_text",
    ...overrides,
  };
}

/** Builds a minimal single_select pool question for the options-editor tests. */
function singleSelectQuestion(
  options: { text: string; isCorrect: boolean }[],
): PoolSingleSelectQuestion {
  return {
    id: "pq-2",
    poolId: "pool-1",
    title: "Pick the capital",
    content: "Choose one.",
    order: 1,
    createdAt: new Date(0),
    weight: 1,
    media: [],
    type: "single_select",
    mcGradingStrategy: "all_or_nothing",
    options: options.map((o, i) => ({ id: `opt-${i}`, ...o })),
  };
}

describe("Feature: Pool question edit panel (Step 30)", () => {
  it("shows the pool question's current title and body, and saves a correction to them", async () => {
    const user = userEvent.setup();
    vi.mocked(updatePoolQuestionAction).mockResolvedValue({
      success: true,
      message: "Question updated",
    });
    const question = freeTextQuestion();

    render(<PoolQuestionEditPanel question={question} poolId="pool-1" />);

    expect(screen.getByDisplayValue("Explain gravity")).toBeInTheDocument();

    await user.clear(screen.getByDisplayValue("Explain gravity"));
    await user.type(
      screen.getByLabelText(/title/i),
      "Explain gravity (revised)",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const submitted = vi.mocked(updatePoolQuestionAction).mock
      .calls[0][1] as FormData;
    expect(submitted.get("title")).toBe("Explain gravity (revised)");
    expect(submitted.get("poolQuestionId")).toBe("pq-1");
  });

  it("shows and edits a single_select pool question's options, preserving the kept option's id", async () => {
    const user = userEvent.setup();
    vi.mocked(updatePoolQuestionAction).mockResolvedValue({
      success: true,
      message: "Question updated",
    });
    const question = singleSelectQuestion([
      { text: "Paris", isCorrect: true },
      { text: "London", isCorrect: false },
    ]);

    render(<PoolQuestionEditPanel question={question} poolId="pool-1" />);

    expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
    expect(screen.getByDisplayValue("London")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/updated/i);
    });

    const submitted = vi.mocked(updatePoolQuestionAction).mock
      .calls[0][1] as FormData;
    const submittedOptions = JSON.parse(submitted.get("options") as string) as {
      id?: string;
      text: string;
      isCorrect: boolean;
    }[];
    expect(submittedOptions).toEqual([
      { id: "opt-0", text: "Paris", isCorrect: true },
      { id: "opt-1", text: "London", isCorrect: false },
    ]);
  });
});

describe("Feature: Delete pool question button (Step 30)", () => {
  it("deletes the pool question on confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(deletePoolQuestionAction).mockResolvedValue({
      success: true,
      message: "Question deleted",
    });

    render(<DeletePoolQuestionButton poolQuestionId="pq-1" poolId="pool-1" />);

    await user.click(screen.getByRole("button", { name: /delete question/i }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /^delete$/i,
      }),
    );

    await waitFor(() => {
      expect(deletePoolQuestionAction).toHaveBeenCalled();
    });
    const submitted = vi.mocked(deletePoolQuestionAction).mock
      .calls[0][1] as FormData;
    expect(submitted.get("poolQuestionId")).toBe("pq-1");
    expect(submitted.get("poolId")).toBe("pool-1");
  });
});
