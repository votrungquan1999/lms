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

  it("clears the selection so the checkbox and count box agree after a successful compose", async () => {
    const user = userEvent.setup();
    vi.mocked(composeFromPoolsAction).mockResolvedValue({
      success: true,
      message: "Added 2 questions from pools",
    });

    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={POOLS} />);

    await user.click(screen.getByLabelText("Select pool Algebra"));
    fireEvent.change(screen.getByLabelText("Count for pool Algebra"), {
      target: { value: "2" },
    });
    await user.click(screen.getByRole("button", { name: "Add from Pools" }));
    await screen.findByText("Added 2 questions from pools");

    expect(screen.getByLabelText("Select pool Algebra")).not.toBeChecked();
    expect(screen.getByLabelText("Count for pool Algebra")).toBeDisabled();
  });

  it("keeps the selection so a retry doesn't need re-picking after a refused compose", async () => {
    const user = userEvent.setup();
    vi.mocked(composeFromPoolsAction).mockResolvedValue({
      success: false,
      message: "Unauthorized: admin access required",
    });

    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={POOLS} />);

    await user.click(screen.getByLabelText("Select pool Algebra"));
    fireEvent.change(screen.getByLabelText("Count for pool Algebra"), {
      target: { value: "2" },
    });
    await user.click(screen.getByRole("button", { name: "Add from Pools" }));
    await screen.findByText("Unauthorized: admin access required");

    expect(screen.getByLabelText("Select pool Algebra")).toBeChecked();
    const countInput = screen.getByLabelText("Count for pool Algebra");
    expect(countInput).toBeEnabled();
    expect(countInput).toHaveValue(2);
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

  it("keeps a ticked pool checked and clickable after a refusal reveals it emptied", async () => {
    const user = userEvent.setup();
    vi.mocked(composeFromPoolsAction).mockResolvedValue({
      success: false,
      message: "Algebra has no questions to draw",
    });

    const { rerender } = render(
      <ComposeFromPoolsForm testId="t1" courseId="c1" pools={POOLS} />,
    );

    await user.click(screen.getByLabelText("Select pool Algebra"));
    await user.click(screen.getByRole("button", { name: "Add from Pools" }));
    await screen.findByText("Algebra has no questions to draw");

    // Mirrors the server's revalidatePath refreshing the pools prop after
    // the refusal discovered Algebra was actually empty.
    rerender(
      <ComposeFromPoolsForm
        testId="t1"
        courseId="c1"
        pools={[
          { id: "pool-1", name: "Algebra", questionCount: 0 },
          { id: "pool-2", name: "Geometry", questionCount: 3 },
        ]}
      />,
    );

    const checkbox = screen.getByLabelText("Select pool Algebra");
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("disables the checkbox for a pool with no questions to draw", () => {
    const pools = [
      { id: "pool-1", name: "Algebra", questionCount: 5 },
      { id: "pool-2", name: "Empty", questionCount: 0 },
    ];
    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={pools} />);

    expect(screen.getByLabelText("Select pool Algebra")).toBeEnabled();
    expect(screen.getByLabelText("Select pool Empty")).toBeDisabled();
  });

  it("explains and disables the button when every pool has no questions", () => {
    const pools = [
      { id: "pool-1", name: "Empty A", questionCount: 0 },
      { id: "pool-2", name: "Empty B", questionCount: 0 },
    ];
    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={pools} />);

    expect(
      screen.getByText(/pools have no questions yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add from Pools" }),
    ).toBeDisabled();
  });

  it("tells the teacher when no pools exist", () => {
    render(<ComposeFromPoolsForm testId="t1" courseId="c1" pools={[]} />);

    expect(
      screen.getByText(/No question pools exist yet/i),
    ).toBeInTheDocument();
  });
});
