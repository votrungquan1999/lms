// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestCountdown } from "../countdown.state";

// `useNow()` is the trusted rAF subscription; controlling it directly keeps the
// countdown's derivation + formatting deterministic (no rAF-frame granularity).
let mockNow = 0;
vi.mock("src/hooks/use-now", () => ({
  useNow: () => mockNow,
}));

const { submitTestActionSpy } = vi.hoisted(() => ({
  submitTestActionSpy: vi.fn(),
}));
vi.mock("../actions", () => ({
  submitTestAction: submitTestActionSpy,
}));

const DEADLINE = 1_000_000;

describe("TestCountdown — display", () => {
  beforeEach(() => {
    mockNow = 0;
    submitTestActionSpy.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the remaining time and decreases it as the clock advances", () => {
    // Given a deadline 10 minutes ahead of the current instant.
    mockNow = DEADLINE - 10 * 60 * 1000;
    const { rerender } = render(
      <TestCountdown deadlineMs={DEADLINE} testId="t-1" courseId="c-1" />,
    );

    // Then it starts at 10:00.
    expect(screen.getByText("10:00")).toBeInTheDocument();

    // When the clock advances by one minute.
    mockNow = DEADLINE - 9 * 60 * 1000;
    rerender(
      <TestCountdown deadlineMs={DEADLINE} testId="t-1" courseId="c-1" />,
    );

    // Then the countdown reads 09:00.
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  it("floors at 00:00 once the deadline has passed", () => {
    // Given the current instant is already past the deadline.
    mockNow = DEADLINE + 5_000;
    render(<TestCountdown deadlineMs={DEADLINE} testId="t-1" courseId="c-1" />);

    // Then it shows 00:00 rather than a negative value.
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });
});

describe("TestCountdown — auto-submit at zero", () => {
  beforeEach(() => {
    mockNow = 0;
    submitTestActionSpy.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits the test once the deadline arrives, not before", () => {
    // Given a timed test with a deadline 60 seconds out.
    const deadlineMs = Date.now() + 60_000;
    render(
      <TestCountdown deadlineMs={deadlineMs} testId="t-1" courseId="c-1" />,
    );

    // Then nothing is submitted before the deadline.
    vi.advanceTimersByTime(59_000);
    expect(submitTestActionSpy).not.toHaveBeenCalled();

    // When the deadline arrives.
    vi.advanceTimersByTime(1_000);

    // Then the test is submitted exactly once.
    expect(submitTestActionSpy).toHaveBeenCalledTimes(1);
  });
});
