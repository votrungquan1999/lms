// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleaseFromList } from "../release-from-list";

vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({ releaseTestAction: vi.fn() }),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function rosterWith(graded: number) {
  return {
    counts: {
      graded,
      waiting: 0,
      stillWriting: 0,
      redoRequested: 0,
      notStarted: 0,
    },
    students: [],
    offerCorrectAnswers: false,
    choiceQuestionCount: 0,
  };
}

/** A fetch whose answers the test sends by hand, one per call. */
function manualFetch() {
  const answers: Array<(roster: unknown) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          answers.push((roster) =>
            resolve({ ok: true, json: async () => roster }),
          );
        }),
    ),
  );
  return answers;
}

describe("Feature: the Release button on a list row", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores a roster answer that belongs to an earlier opening", async () => {
    // Given the teacher opened the dialog, closed it before the roster came back, and opened it again
    const answers = manualFetch();
    render(<ReleaseFromList testId="t1" courseId="c1" testTitle="Midterm" />);
    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(answers).toHaveLength(2);

    // When the first opening's answer arrives late
    answers[0]?.(rosterWith(9));

    // Then the second opening still waits for its own answer instead of showing the old counts
    await waitFor(() =>
      expect(screen.getByText("Loading students…")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/9 graded/)).not.toBeInTheDocument();

    // When the second opening's answer arrives
    answers[1]?.(rosterWith(2));

    // Then its counts show
    expect(await screen.findByText(/2 graded/)).toBeInTheDocument();
  });
});
