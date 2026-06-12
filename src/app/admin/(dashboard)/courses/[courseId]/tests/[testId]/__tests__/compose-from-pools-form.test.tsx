// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { composeFromPoolsAction } from "../compose-from-pools-actions";
import { ComposeFromPoolsForm } from "../compose-from-pools-form";

vi.mock("../compose-from-pools-actions", () => ({
  composeFromPoolsAction: vi.fn(),
}));

const POOLS = [
  { id: "pool-1", name: "Algebra", questionCount: 5 },
  { id: "pool-2", name: "Geometry", questionCount: 3 },
];

/**
 * Feature: Add from Pools
 * As an admin editing a test
 * I want to draw questions from question pools
 * So that I can compose a test from a shared bank.
 */

describe("Feature: Add from Pools form", () => {
  it("renders a row for each available pool", () => {
    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={POOLS} />);

    expect(screen.getAllByTestId("compose-pool-row")).toHaveLength(2);
    expect(screen.getByText("Algebra")).toBeInTheDocument();
    expect(screen.getByText("Geometry")).toBeInTheDocument();
  });

  it("submits the selected pool and its count to the compose action", async () => {
    const user = userEvent.setup();
    vi.mocked(composeFromPoolsAction).mockResolvedValue({
      success: true,
      message: "Added 2 questions from pools",
    });

    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={POOLS} />);

    await user.click(screen.getByLabelText("Select pool Algebra"));
    const countInput = screen.getByLabelText("Count for pool Algebra");
    fireEvent.change(countInput, { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Add from Pools" }));

    await waitFor(() => expect(composeFromPoolsAction).toHaveBeenCalled());

    // The submitted FormData carries only the selected pool with its count.
    const formData = vi.mocked(composeFromPoolsAction).mock.calls[0][1];
    const selections = JSON.parse(formData.get("selections") as string);
    expect(selections).toEqual([{ poolId: "pool-1", count: 2 }]);

    expect(
      await screen.findByText("Added 2 questions from pools"),
    ).toBeInTheDocument();
  });

  it("submits an empty selection list when no pool is checked", async () => {
    const user = userEvent.setup();
    vi.mocked(composeFromPoolsAction).mockClear();
    vi.mocked(composeFromPoolsAction).mockResolvedValue({
      success: false,
      message: "Select at least one pool",
    });

    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={POOLS} />);

    await user.click(screen.getByRole("button", { name: "Add from Pools" }));

    await waitFor(() => expect(composeFromPoolsAction).toHaveBeenCalled());
    const formData = vi.mocked(composeFromPoolsAction).mock.calls[0][1];
    expect(JSON.parse(formData.get("selections") as string)).toEqual([]);
  });

  it("tells the teacher when no pools exist", () => {
    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={[]} />);

    expect(
      screen.getByText(/No question pools exist yet/i),
    ).toBeInTheDocument();
  });
});
